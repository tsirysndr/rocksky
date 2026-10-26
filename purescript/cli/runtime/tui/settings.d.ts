export type RepeatName = "off" | "one" | "all";
export interface Settings {
    volume: number;
    shuffle: boolean;
    repeat: RepeatName;
    output: string;
    mpd: {
        enabled: boolean;
        port: number;
        bind: string;
    };
    remote: {
        name: string;
    };
    equalizer: {
        enabled: boolean;
        bands: number[];
        bass: number;
        treble: number;
        crossfade: number;
        fadeInDelay: number;
        fadeInDuration: number;
        fadeOutDelay: number;
        fadeOutDuration: number;
        mixMode: number;
        replaygain: number;
        replaygainPreamp: number;
        replaygainClip: boolean;
    };
}
export declare const DEFAULT_SETTINGS: Settings;
/** Read settings.toml, falling back to defaults for anything missing/invalid. */
export declare function loadSettings(): Settings;
export declare function saveSettings(s: Omit<Settings, "mpd" | "remote" | "output">): void;
