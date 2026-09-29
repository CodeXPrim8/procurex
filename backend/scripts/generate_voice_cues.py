import asyncio
from pathlib import Path
import edge_tts

OUT = Path(r"c:\Users\clemx\PROCUREMENT\web\public\tts\cues")
OUT.mkdir(parents=True, exist_ok=True)

VOICES = {
    "nova": ("en-US-JennyNeural", "+2%", "+2Hz"),
    "shimmer": ("en-US-AriaNeural", "+10%", "+4Hz"),
    "kore": ("en-US-MichelleNeural", "-4%", "+1Hz"),
    "zephyr": ("en-GB-SoniaNeural", "-8%", "+2Hz"),
    "alloy": ("en-US-AvaNeural", "+0%", "+0Hz"),
    "echo": ("en-US-GuyNeural", "-2%", "-2Hz"),
    "onyx": ("en-US-ChristopherNeural", "-8%", "-4Hz"),
    "puck": ("en-US-AndrewNeural", "+8%", "+2Hz"),
}

CUES = {
    "mmhmm": "Mm-hmm.",
    "yeah": "Yeah.",
    "oh": "Oh.",
    "right": "That's right.",
    "okay": "Okay.",
    "listening": "I'm listening.",
}


async def one(vid: str, voice: str, rate: str, pitch: str, cue: str, text: str) -> None:
    dest = OUT / f"{vid}-{cue}.mp3"
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(str(dest))
    print(dest.name, dest.stat().st_size)


async def main() -> None:
    for vid, (voice, rate, pitch) in VOICES.items():
        for cue, text in CUES.items():
            try:
                await one(vid, voice, rate, pitch, cue, text)
            except Exception as exc:
                print("FAIL", vid, cue, exc)


if __name__ == "__main__":
    asyncio.run(main())
