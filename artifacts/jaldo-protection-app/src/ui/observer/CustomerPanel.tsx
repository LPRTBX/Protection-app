import { useEffect, useRef, useState } from "react";
import { CustomerApp } from "../Customer";
import { CUSTOMER_TABS, type CustomerTab } from "../nav";
import { PanelNavProvider } from "../panelnav";
import { PanelFrame, scrollPanelToTop, type FrameProps } from "./PanelFrame";

/** The customer's own app, reading only the customer projection. Its tabs belong to this panel. */
export function CustomerPanel(props: Omit<FrameProps, "id" | "title" | "sees" | "children" | "nav" | "footer">) {
  const [tab, setTab] = useState<CustomerTab>("today");
  const first = useRef(true);
  // After the customer's own navigation, focus goes to the screen title, as it does when the app navigates by itself.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    document.getElementById("obs-customer-title")?.focus({ preventScroll: true });
  }, [tab]);
  const nav = {
    id: "obs-customer",
    go: (to: string) => {
      const next = to.split("/")[1];
      const found = CUSTOMER_TABS.find((t) => t.tab === next);
      if (found) { setTab(found.tab); scrollPanelToTop("customer"); }
    },
  };
  return (
    <PanelFrame id="customer" title="Customer" sees="The customer's own app: their request and what a person has approved to tell them." {...props}>
      <PanelNavProvider value={nav}>
        <CustomerApp tab={tab} />
      </PanelNavProvider>
    </PanelFrame>
  );
}
