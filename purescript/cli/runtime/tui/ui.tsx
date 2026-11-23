import { TextAttributes, type BoxOptions, type KeyEvent } from "@opentui/core";
import { useKeyboard, usePaste, useRenderer } from "@opentui/react";
import React, { createContext, useContext } from "react";
import { palette } from "./theme.js";

// Design primitives backed by OpenTUI renderables. Inline labels become spans,
// while top-level labels participate in native layout and cell-aware truncation.
const InlineText = createContext(false);
export interface BoxProps extends Omit<BoxOptions, "id" | "borderStyle"> {
  children?: React.ReactNode;
  borderStyle?: "round" | "rounded" | "single" | "double" | "heavy";
  display?: "none" | "flex";
}
export function Box({ children, borderStyle, display, ...props }: BoxProps) {
  return React.createElement(
    "box",
    {
      flexDirection: "row",
      flexShrink: 0,
      ...props,
      ...(borderStyle
        ? {
            border: true,
            borderStyle: borderStyle === "round" ? "rounded" : borderStyle,
          }
        : {}),
      ...(display === "none"
        ? {
            visible: false,
            height: 0,
            width: 0,
            flexGrow: 0,
            overflow: "hidden",
          }
        : {}),
    },
    children,
  );
}
export function ScrollBox({
  children,
  focused = false,
}: {
  children?: React.ReactNode;
  focused?: boolean;
}) {
  return React.createElement(
    "scrollbox",
    {
      flexGrow: 1,
      flexShrink: 1,
      minHeight: 0,
      scrollX: false,
      scrollY: true,
      focused,
      contentOptions: { flexDirection: "column" },
    },
    children,
  );
}
export interface TextProps {
  children?: React.ReactNode;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dimColor?: boolean;
  inverse?: boolean;
  wrap?: "truncate-end" | "truncate" | "wrap";
  width?: number;
}
export function Text({
  children,
  color,
  backgroundColor,
  bold,
  dimColor,
  inverse,
  wrap,
  width,
}: TextProps) {
  const inline = useContext(InlineText);
  const attributes =
    (bold ? TextAttributes.BOLD : 0) |
    (dimColor ? TextAttributes.DIM : 0) |
    (inverse ? TextAttributes.INVERSE : 0);
  const props = {
    fg: color ?? (inline ? undefined : palette.text),
    bg: backgroundColor,
    attributes,
  };
  if (inline) return React.createElement("span", props, children);
  return React.createElement(
    "text",
    {
      ...props,
      width,
      minWidth: 0,
      flexShrink: 1,
      wrapMode: wrap?.startsWith("truncate") ? "none" : "word",
      truncate: wrap?.startsWith("truncate") ?? false,
    },
    React.createElement(InlineText.Provider, { value: true }, children),
  );
}
export interface Key {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  return: boolean;
  escape: boolean;
  backspace: boolean;
  delete: boolean;
  tab: boolean;
}
export function normalizeKey(event: KeyEvent): [string, Key] {
  const name = event.name;
  // Printable input comes from the decoded sequence (preserves uppercase and
  // punctuation). Named navigation keys must never leak into text fields.
  const printable = event.sequence && !/[\x00-\x1f\x7f]/.test(event.sequence);
  const input =
    name === "space"
      ? " "
      : event.ctrl && name.length === 1
        ? name
        : printable
          ? event.sequence
          : "";
  return [
    input,
    {
      ctrl: event.ctrl,
      meta: event.meta,
      shift: event.shift,
      upArrow: name === "up",
      downArrow: name === "down",
      leftArrow: name === "left",
      rightArrow: name === "right",
      return: name === "return" || name === "enter",
      escape: name === "escape",
      backspace: name === "backspace",
      delete: name === "delete",
      tab: name === "tab",
    },
  ];
}
export function useInput(
  handler: (input: string, key: Key) => void,
  { isActive = true } = {},
) {
  useKeyboard((event) => {
    if (isActive && event.eventType !== "release")
      handler(...normalizeKey(event));
  });
  usePaste((event) => {
    if (isActive)
      handler(
        new TextDecoder().decode(event.bytes).replace(/[\x00-\x1f\x7f]/g, ""),
        {
          ctrl: false,
          meta: false,
          shift: false,
          upArrow: false,
          downArrow: false,
          leftArrow: false,
          rightArrow: false,
          return: false,
          escape: false,
          backspace: false,
          delete: false,
          tab: false,
        },
      );
  });
}
export function useApp() {
  const renderer = useRenderer();
  return { exit: () => renderer.destroy() };
}
