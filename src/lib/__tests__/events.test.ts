import { describe, test, expect, mock } from "bun:test";
import { emitLinkEvent, onLinkEvent } from "../events";
import type { LinkEvent } from "../events";

describe("event emitter", () => {
  test("emitLinkEvent calls all registered listeners", () => {
    const received: LinkEvent[] = [];
    const unsub1 = onLinkEvent((e) => received.push(e));
    const unsub2 = onLinkEvent((e) => received.push(e));

    emitLinkEvent({ type: "link:created", linkId: "abc", userId: "user1" });

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe("link:created");
    expect(received[0].linkId).toBe("abc");
    expect(received[0].userId).toBe("user1");
    expect(received[1].type).toBe("link:created");

    unsub1();
    unsub2();
  });

  test("unsubscribe removes the listener", () => {
    const received: LinkEvent[] = [];
    const unsub = onLinkEvent((e) => received.push(e));

    emitLinkEvent({ type: "link:created", linkId: "a", userId: "u" });
    expect(received).toHaveLength(1);

    unsub();

    emitLinkEvent({ type: "link:updated", linkId: "b", userId: "u" });
    expect(received).toHaveLength(1); // still 1 — no new event received
  });

  test("listener errors do not break other listeners", () => {
    const received: LinkEvent[] = [];

    const unsub1 = onLinkEvent(() => {
      throw new Error("boom");
    });
    const unsub2 = onLinkEvent((e) => received.push(e));

    emitLinkEvent({ type: "link:deleted", linkId: "x", userId: "u" });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("link:deleted");

    unsub1();
    unsub2();
  });

  test("timestamp is auto-populated as ISO 8601", () => {
    let captured: LinkEvent | null = null;
    const unsub = onLinkEvent((e) => {
      captured = e;
    });

    emitLinkEvent({ type: "link:archived", linkId: "z", userId: "u" });

    expect(captured).not.toBeNull();
    expect(captured!.timestamp).toBeDefined();
    // Should be a valid ISO date
    expect(new Date(captured!.timestamp).toISOString()).toBe(captured!.timestamp);

    unsub();
  });

  test("multiple event types are passed through correctly", () => {
    const types: string[] = [];
    const unsub = onLinkEvent((e) => types.push(e.type));

    emitLinkEvent({ type: "link:created", linkId: "1", userId: "u" });
    emitLinkEvent({ type: "link:updated", linkId: "2", userId: "u" });
    emitLinkEvent({ type: "link:deleted", linkId: "3", userId: "u" });
    emitLinkEvent({ type: "link:archived", linkId: "4", userId: "u" });

    expect(types).toEqual([
      "link:created",
      "link:updated",
      "link:deleted",
      "link:archived",
    ]);

    unsub();
  });
});
