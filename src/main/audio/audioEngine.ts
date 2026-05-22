import log from 'electron-log';

export class AudioEngine {
  private volumes: Map<string, number> = new Map();
  private masterVolume = 1.0;
  private speakerEnabled = true;

  setSpeakerEnabled(enabled: boolean): void {
    this.speakerEnabled = enabled;
    log.info(`Speaker ${enabled ? 'enabled' : 'disabled'}`);
  }

  setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
  }

  setSiteVolume(siteId: string, vol: number): void {
    this.volumes.set(siteId, Math.max(0, Math.min(1, vol)));
  }

  getSiteVolume(siteId: string): number {
    return this.volumes.get(siteId) ?? 1.0;
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  isSpeakerEnabled(): boolean {
    return this.speakerEnabled;
  }

  shutdown(): void {
    log.info('AudioEngine shutdown');
  }
}
