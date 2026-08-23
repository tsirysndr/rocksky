import React from "react";
import { Input } from "baseui/input";
import { LabelMedium } from "baseui/typography";
import { IconEye, IconEyeOff, IconLock } from "@tabler/icons-react";
import { Button } from "baseui/button";

interface LoginFormProps {
  handle: string;
  setHandle: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  passwordLogin: boolean;
  setPasswordLogin: (value: boolean) => void;
  onLogin: () => void;
  onCreateAccount: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({
  handle,
  setHandle,
  password,
  setPassword,
  passwordLogin,
  setPasswordLogin,
  onLogin,
  onCreateAccount,
}) => {
  return (
    <div className="max-w-[400px] mt-[40px] mx-auto">
      <div className="mb-[20px]">
        <div className="flex flex-row mb-[15px]">
          <LabelMedium className="!text-[var(--color-text)] flex-1">
            Handle
          </LabelMedium>
          <LabelMedium
            className="!text-[var(--color-primary)] cursor-pointer"
            onClick={() => setPasswordLogin(!passwordLogin)}
          >
            {passwordLogin ? "OAuth Login" : "Password Login"}
          </LabelMedium>
        </div>
        <Input
          name="handle"
          startEnhancer={
            <div className="text-[var(--color-text-muted)] bg-[var(--color-input-background)]">
              @
            </div>
          }
          placeholder="<username>.bsky.social"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          overrides={{
            Root: {
              style: {
                backgroundColor: "var(--color-input-background)",
                borderColor: "var(--color-input-background)",
              },
            },
            StartEnhancer: {
              style: {
                backgroundColor: "var(--color-input-background)",
              },
            },
            InputContainer: {
              style: {
                backgroundColor: "var(--color-input-background)",
              },
            },
            Input: {
              style: {
                color: "var(--color-text)",
                caretColor: "var(--color-text)",
              },
            },
          }}
        />
        {passwordLogin && (
          <Input
            name="password"
            startEnhancer={
              <div className="text-[var(--color-text-muted)] bg-[var(--color-input-background)]">
                <IconLock size={19} className="mt-[8px]" />
              </div>
            }
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            overrides={{
              Root: {
                style: {
                  backgroundColor: "var(--color-input-background)",
                  borderColor: "var(--color-input-background)",
                  marginTop: "1rem",
                },
              },
              StartEnhancer: {
                style: {
                  backgroundColor: "var(--color-input-background)",
                },
              },
              InputContainer: {
                style: {
                  backgroundColor: "var(--color-input-background)",
                },
              },
              Input: {
                style: {
                  color: "var(--color-text)",
                  caretColor: "var(--color-text)",
                },
              },
              MaskToggleHideIcon: {
                component: () => (
                  <IconEyeOff
                    className="text-[var(--color-text-muted)]"
                    size={20}
                  />
                ),
              },
              MaskToggleShowIcon: {
                component: () => (
                  <IconEye
                    className="text-[var(--color-text-muted)]"
                    size={20}
                  />
                ),
              },
            }}
          />
        )}
      </div>
      <Button
        onClick={() => onLogin()}
        overrides={{
          BaseButton: {
            style: {
              width: "100%",
              backgroundColor: "var(--color-primary)",
              ":hover": {
                backgroundColor: "var(--color-primary)",
              },
              ":focus": {
                backgroundColor: "var(--color-primary)",
              },
            },
          },
        }}
      >
        Sign In
      </Button>
      <LabelMedium className="text-center mt-[20px] !text-[var(--color-text-muted)]">
        Don't have an atproto handle yet?
      </LabelMedium>
      <div className="text-center text-[var(--color-text-muted)] ">
        You can create one at{" "}
        <span
          onClick={onCreateAccount}
          className="no-underline cursor-pointer !text-[var(--color-primary)]"
        >
          selfhosted.social
        </span>
        ,{" "}
        <a
          href="https://bsky.app"
          className="no-underline cursor-pointer !text-[var(--color-primary)]"
          target="_blank"
          rel="noopener noreferrer"
        >
          Bluesky
        </a>{" "}
        or any other AT Protocol service.
      </div>
    </div>
  );
};

export default LoginForm;
