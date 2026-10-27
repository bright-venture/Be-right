import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { useI18n } from "@/i18n";
import { pushStatus, turnOffPush, turnOnPush, type PushStatus } from "@/lib/push";

/** Notifications on this phone: their state, and turning them on or off (server included). */
export function usePush() {
  const utils = trpc.useUtils();
  const { lang } = useI18n();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushStatus().then(setStatus);
  }, []);

  const save = useCallback(
    (token: string) => utils.client.push.register.mutate({ token, platform: "android", lang }),
    [utils, lang],
  );
  const forget = useCallback((token: string) => utils.client.push.unregister.mutate({ token }), [utils]);

  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      setStatus(await turnOnPush(save));
    } catch {
      setStatus(await pushStatus());
    } finally {
      setBusy(false);
    }
  }, [save]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    try {
      await turnOffPush(forget);
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }, [forget]);

  return { status, busy, turnOn, turnOff, save };
}
