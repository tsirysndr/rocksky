import Feather from "@expo/vector-icons/Feather";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type {
  CrossfadeMode,
  FadeOutMixMode,
  ReplayGainMode,
} from "../api/audioSettings";
import { EQ_BANDS_HZ, EQ_Q } from "../api/audioSettings";
import type { EqualizerPreset } from "../api/equalizerPresets";
import {
  useDeleteEqualizerPresetMutation,
  useEqualizerPresetsQuery,
  useSaveEqualizerPresetMutation,
} from "../hooks/useEqualizerPresets";
import {
  useAudioSettingsMutation,
  useAudioSettingsQuery,
} from "../hooks/useAudioSettings";
import { usePlaybackSource } from "../hooks/usePlaybackSource";
import { colors } from "../theme";
import EqBandSlider from "./EqBandSlider";
import ValueStepper from "./ValueStepper";
import { Text } from "./Text";

type Props = { visible: boolean; onClose: () => void };

// The record's enums, in the order they read best. The value is what is stored,
// so these are not interchangeable with the firmware's integer indices.
const REPLAYGAIN_MODES: { value: ReplayGainMode; label: string }[] = [
  { value: "disabled", label: "Off" },
  { value: "track", label: "Track" },
  { value: "album", label: "Album" },
  { value: "trackIfShuffling", label: "Track (shuffle)" },
];

const CROSSFADE_MODES: { value: CrossfadeMode; label: string }[] = [
  { value: "disabled", label: "Off" },
  { value: "enabled", label: "Always" },
  { value: "shuffle", label: "Shuffle" },
  { value: "albumChange", label: "Album change" },
  { value: "trackChange", label: "Track change" },
];

const MIX_MODES: { value: FadeOutMixMode; label: string }[] = [
  { value: "crossfade", label: "Crossfade" },
  { value: "mix", label: "Mix" },
];

const freqLabel = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : `${hz}`);

/** Tenths of a dB as a reading: `-7.5 dB`, and `0 dB` rather than `0.0 dB`. */
const db = (tenths: number) =>
  `${tenths % 10 === 0 ? tenths / 10 : (tenths / 10).toFixed(1)} dB`;

const balanceLabel = (value: number) =>
  value === 0 ? "center" : value < 0 ? `${-value}% L` : `${value}% R`;

const seconds = (ms: number) =>
  ms % 1000 === 0 ? `${ms / 1000}s` : `${(ms / 1000).toFixed(1)}s`;

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionRule} />
    </View>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text
              style={[styles.segmentText, active && styles.segmentTextActive]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

/**
 * The audio settings editor, modelled on the web client's settings page and the
 * desktop player's overlay: an EQ with per-band sliders and a precut knob, then
 * tone, ReplayGain and crossfade.
 *
 * Every control writes a section patch to the user's settings record, which is
 * the cross-device source of truth — players read it and apply it. The server
 * clamps and echoes the stored record back, so what ends up on screen is what
 * was actually accepted.
 */
export default function AudioSettingsSheet({ visible, onClose }: Props) {
  const { settings, isLoading } = useAudioSettingsQuery(visible);
  const { patch, flush } = useAudioSettingsMutation();
  const { current, sourceLabel } = usePlaybackSource();
  const { data: presets } = useEqualizerPresetsQuery(visible);
  const savePreset = useSaveEqualizerPresetMutation();
  const deletePreset = useDeleteEqualizerPresetMutation();
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState("");

  const eq = settings.equalizer ?? {};
  const tone = settings.tone ?? {};
  const rg = settings.replayGain ?? {};
  const cf = settings.crossfade ?? {};
  const bands = eq.bands ?? [];
  const eqEnabled = eq.enabled ?? false;
  const precut = eq.precut ?? 0;

  /**
   * Touching any EQ control switches the equalizer on.
   *
   * Moving a band while it is bypassed otherwise does nothing audible, which
   * reads as a broken slider; wanting the curve is the same as wanting the EQ.
   */
  const setEqualizer = (change: { bands?: typeof bands; precut?: number }) => {
    patch({ equalizer: { ...change, enabled: true } });
  };

  const setBandGain = (index: number, gain: number) => {
    setEqualizer({
      bands: bands.map((band, i) => (i === index ? { ...band, gain } : band)),
    });
  };

  // Applying a preset is an ordinary settings write — the same path the sliders
  // take — so every player picks it up the usual way.
  const applyPreset = (preset: EqualizerPreset) => {
    patch({
      equalizer: {
        enabled: true,
        precut: preset.precut ?? 0,
        // Keyed by index against the fixed band table, so a preset saved
        // against a different frequency list can't land on the wrong band.
        bands: EQ_BANDS_HZ.map((frequency, index) => ({
          frequency,
          gain: preset.bands[index]?.gain ?? 0,
          q: preset.bands[index]?.q ?? EQ_Q,
        })),
      },
    });
    flush();
  };

  // Closing is also "I'm done": send whatever the debounce is still holding
  // rather than waiting for the timer on a sheet that is gone.
  const close = () => {
    flush();
    onClose();
  };

  const confirmDelete = (preset: EqualizerPreset) => {
    Alert.alert(preset.name, "Delete this preset?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deletePreset.mutate(preset.rkey),
      },
    ]);
  };

  const saveCurrent = () => {
    const name = presetName.trim();
    if (!name) return;
    savePreset.mutate(
      { name, precut, bands },
      {
        onSuccess: () => {
          setPresetName("");
          setSaving(false);
        },
      },
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Feather name="sliders" size={16} color={colors.text} />
          <Text style={styles.title}>Audio Settings</Text>
          <TouchableOpacity onPress={close} hitSlop={10}>
            <Feather name="x" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            <SectionHeader title="EQUALIZER" />
            {/* Worth a word: none of it is suggested by the controls. */}
            <Text style={styles.hint}>
              Drag a band to shape the curve; tap − and + to step a value, hold
              to run, long-press a reading to reset it.
            </Text>
            <Row label="Enable EQ">
              <Switch
                value={eqEnabled}
                onValueChange={(enabled) => {
                  patch({ equalizer: { enabled } });
                  flush();
                }}
                trackColor={{ false: colors.surface2, true: colors.primary }}
                thumbColor="#fff"
              />
            </Row>

            {/* Presets: tap to apply, long-press to delete. Saved as records in
                the user's repo, so they are the same presets as on web. */}
            <View style={styles.presetRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetList}
              >
                {(presets ?? []).map((preset) => (
                  <TouchableOpacity
                    key={preset.rkey}
                    style={styles.preset}
                    onPress={() => applyPreset(preset)}
                    onLongPress={() => confirmDelete(preset)}
                  >
                    <Text numberOfLines={1} style={styles.presetText}>
                      {preset.name}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.preset, styles.presetSave]}
                  onPress={() => setSaving((open) => !open)}
                >
                  <Feather name="plus" size={12} color={colors.text} />
                  <Text style={styles.presetText}>Save</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {saving && (
              <View style={styles.saveRow}>
                <TextInput
                  value={presetName}
                  onChangeText={setPresetName}
                  placeholder="Preset name"
                  placeholderTextColor={colors.textMuted}
                  style={styles.saveInput}
                  autoFocus
                  maxLength={64}
                  onSubmitEditing={saveCurrent}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={saveCurrent}
                  disabled={!presetName.trim() || savePreset.isPending}
                >
                  <Text style={styles.saveButtonText}>
                    {savePreset.isPending ? "Saving…" : "Save"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* The bands dim rather than vanish when the EQ is off, so the curve
                stays readable while it is bypassed. */}
            <View style={styles.eqRow}>
              <View style={styles.bands}>
                {bands.map((band, index) => (
                  <EqBandSlider
                    key={band.frequency}
                    gain={band.gain}
                    freqLabel={freqLabel(band.frequency)}
                    disabled={!eqEnabled}
                    onChange={(gain) => setBandGain(index, gain)}
                    onRelease={flush}
                  />
                ))}
              </View>
            </View>
            <ValueStepper
              label="Precut"
              steps={48}
              // Precut is headroom, so it only goes one way: 0 to -24 dB.
              valueText={db(precut)}
              norm={1 + precut / 240}
              defaultNorm={1}
              onChange={(value) =>
                setEqualizer({ precut: -Math.round((1 - value) * 48) * 5 })
              }
              onRelease={flush}
            />

            <SectionHeader title="TONE" />
            <View style={styles.stepperGroup}>
              <ValueStepper
                label="Bass"
                steps={48}
                valueText={`${tone.bass ?? 0} dB`}
                norm={((tone.bass ?? 0) + 24) / 48}
                defaultNorm={0.5}
                onChange={(value) =>
                  patch({ tone: { bass: Math.round(value * 48) - 24 } })
                }
                onRelease={flush}
              />
              <ValueStepper
                label="Treble"
                steps={48}
                valueText={`${tone.treble ?? 0} dB`}
                norm={((tone.treble ?? 0) + 24) / 48}
                defaultNorm={0.5}
                onChange={(value) =>
                  patch({ tone: { treble: Math.round(value * 48) - 24 } })
                }
                onRelease={flush}
              />
              <ValueStepper
                label="Balance"
                steps={40}
                valueText={balanceLabel(tone.balance ?? 0)}
                norm={((tone.balance ?? 0) + 100) / 200}
                defaultNorm={0.5}
                onChange={(value) =>
                  patch({ tone: { balance: Math.round(value * 200) - 100 } })
                }
                onRelease={flush}
              />
            </View>

            <SectionHeader title="REPLAYGAIN" />
            <Segmented
              options={REPLAYGAIN_MODES}
              value={rg.mode ?? "disabled"}
              onChange={(mode) => {
                patch({ replayGain: { mode } });
                flush();
              }}
            />
            <Row label="Prevent clipping">
              <Switch
                value={rg.preventClipping ?? false}
                onValueChange={(preventClipping) => {
                  patch({ replayGain: { preventClipping } });
                  flush();
                }}
                trackColor={{ false: colors.surface2, true: colors.primary }}
                thumbColor="#fff"
              />
            </Row>
            <View style={styles.stepperGroup}>
              <ValueStepper
                label="Pre-amp"
                steps={48}
                valueText={db(rg.preamp ?? 0)}
                norm={((rg.preamp ?? 0) + 120) / 240}
                defaultNorm={0.5}
                onChange={(value) =>
                  patch({
                    replayGain: { preamp: Math.round(value * 48) * 5 - 120 },
                  })
                }
                onRelease={flush}
              />
            </View>

            <SectionHeader title="CROSSFADE" />
            <Segmented
              options={CROSSFADE_MODES}
              value={cf.mode ?? "disabled"}
              onChange={(mode) => {
                patch({ crossfade: { mode } });
                flush();
              }}
            />
            <View style={styles.stepperGroup}>
              <ValueStepper
                label="In delay"
                steps={28}
                valueText={seconds(cf.fadeInDelay ?? 0)}
                norm={(cf.fadeInDelay ?? 0) / 7000}
                defaultNorm={0}
                onChange={(value) =>
                  patch({
                    crossfade: { fadeInDelay: Math.round(value * 28) * 250 },
                  })
                }
                onRelease={flush}
              />
              <ValueStepper
                label="In fade"
                steps={30}
                valueText={seconds(cf.fadeInDuration ?? 0)}
                norm={(cf.fadeInDuration ?? 0) / 15000}
                defaultNorm={2000 / 15000}
                onChange={(value) =>
                  patch({
                    crossfade: { fadeInDuration: Math.round(value * 30) * 500 },
                  })
                }
                onRelease={flush}
              />
              <ValueStepper
                label="Out delay"
                steps={28}
                valueText={seconds(cf.fadeOutDelay ?? 0)}
                norm={(cf.fadeOutDelay ?? 0) / 7000}
                defaultNorm={0}
                onChange={(value) =>
                  patch({
                    crossfade: { fadeOutDelay: Math.round(value * 28) * 250 },
                  })
                }
                onRelease={flush}
              />
              <ValueStepper
                label="Out fade"
                steps={30}
                valueText={seconds(cf.fadeOutDuration ?? 0)}
                norm={(cf.fadeOutDuration ?? 0) / 15000}
                defaultNorm={2000 / 15000}
                onChange={(value) =>
                  patch({
                    crossfade: {
                      fadeOutDuration: Math.round(value * 30) * 500,
                    },
                  })
                }
                onRelease={flush}
              />
            </View>
            <Row label="Fade out mode">
              <Segmented
                options={MIX_MODES}
                value={cf.fadeOutMixMode ?? "crossfade"}
                onChange={(fadeOutMixMode) => {
                  patch({ crossfade: { fadeOutMixMode } });
                  flush();
                }}
              />
            </Row>

            {/* Says plainly where a change lands: a remote player gets it over
                the wire at once, while this phone's own engine has no DSP yet
                and only keeps the settings. */}
            <Text style={styles.footnote}>
              {current?.kind === "device"
                ? `Saved to your account and sent to ${sourceLabel}.`
                : "Saved to your account. Players with DSP support apply these; this device has no DSP yet."}
            </Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 10,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  loading: {
    paddingVertical: 48,
    alignItems: "center",
  },
  body: {
    paddingBottom: 12,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.textMuted,
  },
  sectionRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 36,
  },
  rowLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  eqRow: {
    flexDirection: "row",
    // Stretch, not centre: centring sized the bands row to its own content, so
    // each band's track — which fills the remaining height — collapsed to
    // nothing. The sliders then had no thumb to show and no area to drag.
    alignItems: "stretch",
    height: 170,
    gap: 8,
  },
  bands: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 2,
    paddingVertical: 4,
  },
  stepperGroup: {
    // The steppers are full-width rows, so they simply stack.
    gap: 2,
  },
  segmented: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface2,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: "#fff",
  },
  hint: {
    fontSize: 10,
    color: colors.textMuted,
    opacity: 0.7,
  },
  presetRow: {
    flexDirection: "row",
  },
  presetList: {
    gap: 6,
    paddingRight: 8,
  },
  preset: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    maxWidth: 150,
  },
  presetSave: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: "transparent",
  },
  presetText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
  },
  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  saveInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  footnote: {
    fontSize: 10,
    color: colors.textMuted,
    opacity: 0.7,
    textAlign: "center",
    paddingTop: 14,
  },
});
