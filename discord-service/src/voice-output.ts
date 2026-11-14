import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import {
  type AudioPlayer,
  AudioPlayerStatus,
  type AudioResource,
  createAudioPlayer,
  createAudioResource,
  entersState,
  NoSubscriberBehavior,
  StreamType,
} from "@discordjs/voice";
import type { AudioOutput } from "./shared-radio.js";

export class VoiceOutput implements AudioOutput {
  readonly player: AudioPlayer;
  private process: ChildProcessWithoutNullStreams | undefined;
  private resource: AudioResource | undefined;
  private offset = 0;

  constructor(noSubscriber = NoSubscriberBehavior.Pause) {
    this.player = createAudioPlayer({ behaviors: { noSubscriber } });
    this.player.on("error", (error) => {
      console.error("Falló el recurso de audio de Discord.");
      if (error.resource === this.resource) this.stop();
    });
  }

  async play(data: Buffer, positionMs: number) {
    this.stop();
    const encoder = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-ss",
        (positionMs / 1000).toFixed(3),
        "-vn",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-c:a",
        "libopus",
        "-b:a",
        "96k",
        "-frame_duration",
        "20",
        "-f",
        "opus",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    this.process = encoder;
    encoder.stderr.resume();
    encoder.stdin.on("error", () => {});
    encoder.on("error", () => {
      if (this.process === encoder) this.stop();
    });
    encoder.on("exit", (code) => {
      if (this.process === encoder && code !== 0 && code !== null) this.stop();
    });
    const resource = createAudioResource(encoder.stdout, {
      inputType: StreamType.OggOpus,
    });
    this.resource = resource;
    this.offset = positionMs;
    encoder.stdin.end(data);
    this.player.play(resource);
    try {
      await entersState(this.player, AudioPlayerStatus.Playing, 10000);
    } catch {
      if (this.process === encoder) this.stop();
      throw new Error("No se pudo preparar el audio para Discord.");
    }
  }

  position() {
    if (!this.resource || this.player.state.status === AudioPlayerStatus.Idle)
      return null;
    return this.offset + this.resource.playbackDuration;
  }

  stop() {
    const encoder = this.process;
    this.process = undefined;
    this.resource = undefined;
    this.player.stop(true);
    encoder?.stdin.destroy();
    encoder?.stdout.destroy();
    encoder?.kill("SIGKILL");
  }
}
