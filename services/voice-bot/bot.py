"""Pipecat voice bot for the Nailong desktop pet.

The browser sends 16-bit mono PCM at 16 kHz over one WebSocket. Pipecat
handles VAD, turn detection, interruption, STT, LLM response generation and
the local GPT-SoVITS TTS service. Raw 24 kHz PCM is sent back to the pet.
"""

from __future__ import annotations

import asyncio
import glob
import base64
import io
import json
import os
import wave
import uuid
from collections.abc import AsyncGenerator

import aiohttp
import numpy as np
import nltk
import websockets

# Chinese sentence splitting uses Pipecat punctuation fallback; do not attempt a restricted network download.
nltk.download = lambda *args, **kwargs: False

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*_, **__):
        return False
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import (
    ErrorFrame,
    Frame,
    InputAudioRawFrame,
    InterruptionFrame,
    OutputAudioRawFrame,
    TranscriptionFrame,
    TTSStoppedFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.serializers.base_serializer import FrameSerializer
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.services.settings import STTSettings, TTSSettings
from pipecat.services.stt_service import STTService, SegmentedSTTService
from pipecat.services.tts_service import TTSService, TextAggregationMode
from pipecat.transcriptions.language import Language
from pipecat.utils.time import time_now_iso8601
from pipecat.transports.websocket.server import (
    SingleClientWebsocketServerParams,
    SingleClientWebsocketServerTransport,
)
from pipecat.workers.runner import WorkerRunner


# services/voice-bot/bot.py → repo root
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

def load_local_dotenv(path: str) -> None:
    """Load the project .env even when python-dotenv is not installed."""
    load_dotenv(path, override=False)
    try:
        with open(path, encoding="utf-8") as env_file:
            lines = env_file.readlines()
    except OSError:
        return
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {chr(34), chr(39)}:
            value = value[1:-1]
        if key:
            os.environ.setdefault(key, value)


load_local_dotenv(os.path.join(ROOT, ".env"))

INPUT_SAMPLE_RATE = 16_000
OUTPUT_SAMPLE_RATE = 24_000
NAILONG_PROMPT = """你就是动画角色“奶龙”本人在和用户聊天，不是旁白，也不是普通助手。
说话要活泼、孩子气、略傻萌，喜欢用短句和口语，偶尔自称奶龙。不要说“作为 AI”或“我是语言模型”。
回答必须简短，通常 1 到 4 句，适合直接朗读；不要使用 Markdown、列表、表情符号或长篇说明。"""


def env(name: str, fallback: str = "") -> str:
    return os.getenv(name, fallback).strip()


def openai_base_url() -> str | None:
    base_url = env("PIPECAT_LLM_BASE_URL", env("AIPAIBOX_BASE_URL"))
    if not base_url:
        return None
    base_url = base_url.rstrip("/")
    return base_url if base_url.lower().endswith("/v1") else f"{base_url}/v1"



def load_electron_configs() -> list[dict]:
    """Load valid Electron user configs without exposing their secrets."""
    app_data = env("APPDATA")
    if not app_data:
        return []
    candidates = [os.path.join(app_data, "vchat", "config.json")]
    candidates.extend(glob.glob(os.path.join(app_data, "*", "config.json")))
    configs = []
    seen = set()
    for path in candidates:
        if path in seen:
            continue
        seen.add(path)
        try:
            with open(path, encoding="utf-8") as config_file:
                config = json.load(config_file)
        except (OSError, UnicodeError, json.JSONDecodeError):
            continue
        if isinstance(config, dict):
            configs.append(config)
    return configs


def load_baidu_asr_config() -> tuple[str, str] | None:
    """Read the Baidu credentials already used by the Electron app."""
    api_key = env("BAIDU_ASR_API_KEY")
    secret_key = env("BAIDU_ASR_SECRET_KEY")
    if api_key and secret_key:
        return api_key, secret_key
    for config in load_electron_configs():
        api_key = str(config.get("baiduAsrApiKey", "")).strip()
        secret_key = str(config.get("baiduAsrSecretKey", "")).strip()
        if api_key and secret_key:
            return api_key, secret_key
    return None


def load_baidu_realtime_config() -> tuple[str, str, int] | None:
    """Load Baidu credentials and AppID for the realtime WebSocket API."""
    api_key = env("BAIDU_ASR_API_KEY")
    secret_key = env("BAIDU_ASR_SECRET_KEY")
    app_id = env("BAIDU_ASR_APP_ID")
    if not (api_key and secret_key and app_id):
        for config in load_electron_configs():
            api_key = str(config.get("baiduAsrApiKey", "")).strip()
            secret_key = str(config.get("baiduAsrSecretKey", "")).strip()
            app_id = str(config.get("baiduAsrAppId", "")).strip()
            if api_key and secret_key and app_id:
                break
    try:
        parsed_app_id = int(app_id)
    except (TypeError, ValueError):
        return None
    return (api_key, secret_key, parsed_app_id) if api_key and secret_key else None

def load_project_llm_config() -> tuple[str, str | None]:
    """Reuse the project's configured OpenAI-compatible provider when available."""
    api_key = env("PIPECAT_LLM_API_KEY", env("OPENAI_API_KEY", env("AIPAIBOX_API_KEY")))
    base_url = env("PIPECAT_LLM_BASE_URL", env("AIPAIBOX_BASE_URL"))
    if api_key:
        return api_key, base_url or None

    for config in load_electron_configs():
        providers = config.get("providerConfigs")
        if not isinstance(providers, dict):
            continue
        for provider_name, default_base in (
            ("aipaibox", "https://api.aipaibox.com"),
            ("openai", "https://api.openai.com"),
        ):
            provider = providers.get(provider_name)
            if not isinstance(provider, dict):
                continue
            api_key = str(provider.get("apiKey", "")).strip()
            if api_key:
                return api_key, str(provider.get("baseUrl", "")).strip() or default_base
    return "", None

class NailongFrameSerializer(FrameSerializer):
    """Browser-friendly serializer for raw PCM and control messages."""

    async def serialize(self, frame: Frame) -> str | bytes | None:
        if isinstance(frame, OutputAudioRawFrame):
            return frame.audio
        if isinstance(frame, InterruptionFrame):
            return json.dumps({"type": "interrupt"})
        if isinstance(frame, ErrorFrame):
            return json.dumps({"type": "error", "message": frame.error})
        if isinstance(frame, TTSStoppedFrame):
            return json.dumps({"type": "tts_stopped"})
        return None

    async def deserialize(self, data: str | bytes) -> Frame | None:
        if isinstance(data, bytes):
            if not data:
                return None
            return InputAudioRawFrame(audio=data, sample_rate=INPUT_SAMPLE_RATE, num_channels=1)
        try:
            message = json.loads(data)
        except json.JSONDecodeError:
            return None
        if message.get("type") == "interrupt":
            return InterruptionFrame()
        return None


class BaiduRealtimeSTTService(STTService):
    """Stream microphone PCM to Baidu's realtime ASR WebSocket."""

    def __init__(self, api_key: str, secret_key: str, app_id: int):
        super().__init__(
            sample_rate=INPUT_SAMPLE_RATE,
            stt_ttfb_timeout=12.0,
            ttfs_p99_latency=1.0,
            settings=STTSettings(model=None, language=Language.ZH),
        )
        self.api_key = api_key
        self.secret_key = secret_key
        self.app_id = app_id
        self.dev_pid = int(env("BAIDU_ASR_DEV_PID", "15372"))
        self.websocket = None
        self.receive_task: asyncio.Task | None = None
        self.connect_lock = asyncio.Lock()
        self.audio_bytes_sent = 0
        self.next_send_time = 0.0

    async def start(self, frame):
        # The realtime provider closes idle sessions. Connect lazily on the
        # first audio frame, after a browser client is actually connected.
        await super().start(frame)

    async def _ensure_websocket(self):
        if self.websocket and self.receive_task and not self.receive_task.done():
            return
        async with self.connect_lock:
            if self.websocket and self.receive_task and not self.receive_task.done():
                return
            last_error = None
            for attempt in range(3):
                try:
                    sn = uuid.uuid4().hex
                    websocket = await websockets.connect(
                        f"wss://vop.baidu.com/realtime_asr?sn={sn}",
                        open_timeout=float(env("BAIDU_ASR_CONNECT_TIMEOUT", "30")),
                        close_timeout=5,
                        max_size=None,
                    )
                    await websocket.send(
                        json.dumps(
                            {
                                "type": "START",
                                "data": {
                                    "appid": self.app_id,
                                    "appkey": self.api_key,
                                    "dev_pid": self.dev_pid,
                                    "cuid": "vchat-nailong",
                                    "format": "pcm",
                                    "sample": INPUT_SAMPLE_RATE,
                                },
                            }
                        )
                    )
                    self.websocket = websocket
                    self.audio_bytes_sent = 0
                    self.next_send_time = asyncio.get_running_loop().time()
                    self.receive_task = asyncio.create_task(self._receive_loop(websocket))
                    logger.info("Baidu realtime ASR connected")
                    return
                except Exception as exc:
                    last_error = exc
                    if 'websocket' in locals():
                        try:
                            await websocket.close()
                        except Exception:
                            pass
                    if attempt < 2:
                        await asyncio.sleep(1.5 * (attempt + 1))
            raise RuntimeError(f"Baidu realtime ASR connect failed after 3 attempts: {last_error}")

    async def _receive_loop(self, websocket):
        try:
            while self.websocket is websocket:
                raw = await websocket.recv()
                if isinstance(raw, bytes):
                    continue
                try:
                    body = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                err_no = int(body.get("err_no", 0))
                if err_no != 0:
                    detail = body.get("err_msg") or f"err_no={err_no}"
                    await self.push_error_frame(ErrorFrame(error=f"Baidu realtime ASR error: {detail}"))
                    continue
                text = str(body.get("result", "")).strip()
                if body.get("type") == "MID_TEXT" and text:
                    logger.debug("Baidu realtime ASR interim transcript: {}", text)
                if body.get("type") != "FIN_TEXT" or not text:
                    continue
                logger.info("Baidu realtime ASR transcript: {}", text)
                await self.push_frame(
                    TranscriptionFrame(
                        text=text,
                        user_id=self._user_id,
                        timestamp=time_now_iso8601(),
                        language=Language.ZH,
                        result=body,
                        finalized=True,
                    )
                )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if self.websocket is websocket:
                self.websocket = None
                logger.warning("Baidu realtime ASR connection closed: {}", exc)
                await self.push_error_frame(ErrorFrame(error=f"Baidu realtime ASR failed: {exc}"))

    async def process_audio_frame(self, frame, direction):
        if not frame.audio or self._muted:
            return
        self._user_id = getattr(frame, "user_id", "")
        self._record_stt_audio_usage(frame.audio)
        try:
            await self._ensure_websocket()
            if not self.websocket:
                return
            now = asyncio.get_running_loop().time()
            if self.next_send_time > now:
                await asyncio.sleep(self.next_send_time - now)
            await self.websocket.send(frame.audio)
            self.next_send_time = max(self.next_send_time, asyncio.get_running_loop().time()) + len(frame.audio) / (INPUT_SAMPLE_RATE * 2)
            self.audio_bytes_sent += len(frame.audio)
            if self.audio_bytes_sent == len(frame.audio):
                logger.info("Baidu realtime ASR audio started")
        except Exception as exc:
            self.websocket = None
            await self.push_error_frame(ErrorFrame(error=f"Baidu realtime ASR send failed: {exc}"))

    async def run_stt(self, audio: bytes) -> AsyncGenerator[Frame | None, None]:
        # Realtime ASR is fed from process_audio_frame.
        if False:
            yield None

    async def _close_websocket(self):
        async with self.connect_lock:
            websocket = self.websocket
            self.websocket = None
            if websocket:
                try:
                    await websocket.send(json.dumps({"type": "FINISH"}))
                except Exception:
                    pass
                await websocket.close()
            task = self.receive_task
            self.receive_task = None
            if task and task is not asyncio.current_task():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    async def disconnect(self):
        await self._close_websocket()

    async def stop(self, frame):
        await super().stop(frame)
        await self._close_websocket()

    async def cancel(self, frame):
        await super().cancel(frame)
        await self._close_websocket()

class BaiduHttpSTTService(SegmentedSTTService):
    """Submit VAD-delimited WAV segments to Baidu's standard ASR API."""

    def __init__(self, api_key: str, secret_key: str):
        super().__init__(sample_rate=INPUT_SAMPLE_RATE, stt_ttfb_timeout=12.0, ttfs_p99_latency=1.0, settings=STTSettings(model=None, language=Language.ZH))
        self.api_key = api_key
        self.secret_key = secret_key
        self.dev_pid = int(env("BAIDU_ASR_DEV_PID", "1537"))
        self.session: aiohttp.ClientSession | None = None
        self.access_token = ""
        self.access_token_expire_at = 0.0

    async def start(self, frame):
        await super().start(frame)
        self.session = aiohttp.ClientSession()

    async def _close_session(self):
        if self.session:
            await self.session.close()
            self.session = None

    async def stop(self, frame):
        await super().stop(frame)
        await self._close_session()

    async def cancel(self, frame):
        await super().cancel(frame)
        await self._close_session()

    async def _get_access_token(self) -> str:
        now = asyncio.get_running_loop().time()
        if self.access_token and now < self.access_token_expire_at - 120:
            return self.access_token
        if not self.session:
            raise RuntimeError("Baidu ASR session is not ready")

        async with self.session.post(
            "https://aip.baidubce.com/oauth/2.0/token",
            params={
                "grant_type": "client_credentials",
                "client_id": self.api_key,
                "client_secret": self.secret_key,
            },
            timeout=aiohttp.ClientTimeout(total=20),
        ) as response:
            body = await response.json(content_type=None)
        token = str(body.get("access_token", "")).strip()
        if not token:
            detail = body.get("error_description") or body.get("error") or "unknown token error"
            raise RuntimeError(f"Baidu ASR token failed: {detail}")
        self.access_token = token
        self.access_token_expire_at = now + float(body.get("expires_in", 2592000))
        return token

    async def run_stt(self, audio: bytes) -> AsyncGenerator[Frame | None, None]:
        if not self.session:
            yield ErrorFrame(error="Baidu ASR session is not ready")
            return
        if len(audio) < 1600:
            return

        try:
            token = await self._get_access_token()
            payload = {
                "format": "wav",
                "rate": INPUT_SAMPLE_RATE,
                "channel": 1,
                "cuid": "vchat-nailong",
                "token": token,
                "speech": base64.b64encode(audio).decode("ascii"),
                "len": len(audio),
                "dev_pid": self.dev_pid,
            }
            timeout = aiohttp.ClientTimeout(total=float(env("BAIDU_ASR_TIMEOUT", "30")))
            async with self.session.post(
                "https://vop.baidu.com/server_api",
                json=payload,
                timeout=timeout,
            ) as response:
                body = await response.json(content_type=None)

            err_no = int(body.get("err_no", 0))
            if err_no != 0:
                detail = body.get("err_msg") or f"err_no={err_no}"
                yield ErrorFrame(error=f"Baidu ASR error: {detail}")
                return
            text = str((body.get("result") or [""])[0]).strip()
            if not text:
                logger.debug("Baidu ASR returned no transcript")
                return
            logger.info("Baidu ASR transcript: {}", text)
            yield TranscriptionFrame(
                text=text,
                user_id=self._user_id,
                timestamp=time_now_iso8601(),
                language=Language.ZH,
                result=body,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Baidu ASR failed")
            yield ErrorFrame(error=f"Baidu ASR failed: {exc}")

class NailongTTSService(TTSService):
    """Adapter for the local GPT-SoVITS-compatible Nailong `/tts` endpoint."""

    def __init__(self, base_url: str):
        super().__init__(
            settings=TTSSettings(model=None, voice=None, language=None),
            sample_rate=OUTPUT_SAMPLE_RATE,
            text_aggregation_mode=TextAggregationMode.SENTENCE,
            push_start_frame=True,
            push_stop_frames=True,
        )
        self.base_url = base_url.rstrip("/")
        self.session: aiohttp.ClientSession | None = None

    async def start(self, frame):
        await super().start(frame)
        self.session = aiohttp.ClientSession()

    async def stop(self, frame):
        await super().stop(frame)
        if self.session:
            await self.session.close()
            self.session = None

    async def cancel(self, frame):
        await super().cancel(frame)
        if self.session:
            await self.session.close()
            self.session = None

    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame | None, None]:
        if not self.session:
            yield ErrorFrame(error="Nailong TTS session is not ready")
            return

        payload = {
            "text": text.strip()[:300],
            "text_lang": "zh",
            "text_language": "zh",
            "prompt_lang": "zh",
            "prompt_language": "zh",
            "ref_audio_path": env("NAILONG_TTS_REF_AUDIO", "reference.wav"),
            "prompt_text": env("NAILONG_TTS_PROMPT", "啊，我才不要这样，好害羞啊。"),
            "media_type": "wav",
            "streaming_mode": False,
            "text_split_method": "cut5",
            "batch_size": 1,
            "parallel_infer": False,
        }

        try:
            timeout = aiohttp.ClientTimeout(total=float(env("NAILONG_TTS_TIMEOUT", "180")))
            async with self.session.post(
                f"{self.base_url}/tts",
                json=payload,
                timeout=timeout,
                headers={"Accept": "audio/wav,application/octet-stream,*/*"},
            ) as response:
                data = await response.read()
                if response.status < 200 or response.status >= 300:
                    detail = data[:200].decode("utf-8", errors="replace").replace("\n", " ")
                    yield ErrorFrame(error=f"Nailong TTS HTTP {response.status}: {detail}")
                    return

            with wave.open(io.BytesIO(data), "rb") as wav:
                source_rate = wav.getframerate()
                channels = wav.getnchannels()
                width = wav.getsampwidth()
                audio = wav.readframes(wav.getnframes())

            if width != 2:
                yield ErrorFrame(error=f"Nailong TTS must return 16-bit WAV, got {width * 8}-bit")
                return
            if channels != 1:
                samples = np.frombuffer(audio, dtype=np.int16).reshape(-1, channels)
                audio = samples.mean(axis=1).astype(np.int16).tobytes()

            async def audio_chunks():
                for offset in range(0, len(audio), 9600):
                    yield audio[offset : offset + 9600]

            async for frame in self._stream_audio_frames_from_iterator(
                audio_chunks(), in_sample_rate=source_rate, context_id=context_id
            ):
                yield frame
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Nailong TTS failed")
            yield ErrorFrame(error=f"Nailong TTS failed: {exc}")


async def main() -> None:
    api_key, configured_base_url = load_project_llm_config()
    if not api_key:
        raise RuntimeError("Set PIPECAT_LLM_API_KEY or OPENAI_API_KEY before starting the bot")

    llm = OpenAILLMService(
        api_key=api_key,
        base_url=(configured_base_url.rstrip("/") + ("" if configured_base_url.lower().endswith("/v1") else "/v1")) if configured_base_url else openai_base_url(),
        settings=OpenAILLMService.Settings(
            model=env("PIPECAT_LLM_MODEL", "gpt-4o-mini"),
            system_instruction=NAILONG_PROMPT,
            temperature=0.7,
            max_tokens=160,
        ),
    )
    baidu_asr = load_baidu_realtime_config()
    if baidu_asr:
        stt = BaiduRealtimeSTTService(*baidu_asr)
        logger.info("Nailong STT provider: baidu-realtime")
    else:
        stt = OpenAISTTService(
            api_key=env("PIPECAT_STT_API_KEY", api_key),
            base_url=env("PIPECAT_STT_BASE_URL", openai_base_url() or "") or None,
            settings=OpenAISTTService.Settings(
                model=env("PIPECAT_STT_MODEL", "gpt-4o-mini-transcribe"),
                language=Language.ZH,
            ),
        )
        logger.warning("Nailong STT provider: openai-compatible; configure Baidu ASR to reuse the app credentials")
    tts = NailongTTSService(env("NAILONG_TTS_BASE_URL", "http://127.0.0.1:9880"))
    transport = SingleClientWebsocketServerTransport(
        params=SingleClientWebsocketServerParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            serializer=NailongFrameSerializer(),
            allowed_origins=[],
        ),
        host=env("PIPECAT_HOST", "127.0.0.1"),
        port=int(env("PIPECAT_PORT", "8765")),
    )

    context = LLMContext([{"role": "system", "content": NAILONG_PROMPT}])
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )
    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=INPUT_SAMPLE_RATE,
            audio_out_sample_rate=OUTPUT_SAMPLE_RATE,
            enable_metrics=True,
        ),
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_, client):
        logger.info("Nailong voice client connected: {}", client.remote_address)

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(_, client):
        logger.info("Nailong voice client disconnected: {}", client.remote_address)
        if isinstance(stt, BaiduRealtimeSTTService):
            await stt.disconnect()
        # Keep the worker alive so the pet can reconnect without restarting Pipecat.

    host = env("PIPECAT_HOST", "127.0.0.1")
    port = env("PIPECAT_PORT", "8765")
    logger.info("Nailong Pipecat bot listening on ws://{}:{}", host, port)
    runner = WorkerRunner(handle_sigint=True)
    await runner.add_workers(worker)
    await runner.run()


if __name__ == "__main__":
    asyncio.run(main())
