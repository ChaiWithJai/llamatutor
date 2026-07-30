"use client";

import { useEffect, useRef, useState } from "react";

export default function ScrollCue() {
  const cueRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const cue = cueRef.current;
    const scroller = cue?.parentElement;
    if (!scroller) return;

    const update = () => {
      const overflows = scroller.scrollHeight > scroller.clientHeight + 1;
      const hasMoreBelow =
        scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
      setVisible(overflows && hasMoreBelow);
    };

    scroller.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(scroller);
    Array.from(scroller.children).forEach((child) => {
      if (child !== cue) resizeObserver.observe(child);
    });
    update();

    return () => {
      scroller.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={cueRef}
      className="coach-panel-scroll-cue"
      data-visible={visible ? "true" : "false"}
      aria-hidden="true"
    />
  );
}
