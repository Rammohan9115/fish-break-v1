// The container for every panel and dialog: a facade over the overlay system (src/ui/overlay).
//  - dialogs (kind="dialog", or any confirm/celebrate layer): Dialog, centred, always fits;
//  - panels (Shop, Settings…): Panel, a bottom Sheet on narrow screens and a docked SidePanel everywhere else.
// Cards for things in the tank (FishCard, DecorCard) use overlay/Card, floating UI uses overlay/Popover.
// One close pattern everywhere: ✕, Esc (topmost overlay only), tap outside (dialogs and modal sheets), swipe down (sheets).
import type { ReactNode } from 'react';
import { Dialog } from '../overlay/Dialog';
import { Panel } from '../overlay/Panel';

export interface SheetProps {
  title: ReactNode;
  /** Omit to make the sheet undismissable (e.g. a choice the player must make). */
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra header content (wallet, badge) between the title and ✕. */
  headerExtra?: ReactNode;
  /** Window size for panels (lg: Shop / My Fish, md: Breeding / Tanks, sm: Settings). Dialogs, docks and sheets ignore it. */
  size?: 'sm' | 'md' | 'lg';
  /** Dialog above other sheets (confirmations). */
  layer?: 'sheet' | 'confirm' | 'celebrate';
  /** Accessible label when the title isn't plain text. */
  ariaLabel?: string;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  /** Plain header (no purple band), e.g. celebrations. */
  plainHeader?: boolean;
  /** Changes when the content swaps (tabs) so the body scrolls back to the top. */
  scrollKey?: string;
  /** A row pinned under the header (tabs, filters) that never scrolls away. */
  tabs?: ReactNode;
  /** Panels only: false leaves the tank playable around a bottom sheet (the Decorate tray). Default true. */
  modal?: boolean;
  /** Panels only: header only (the Decorate tray folds). */
  collapsed?: boolean;
  /** Panels only: where the bottom sheet opens. */
  snap?: 'peek' | 'half' | 'full';
  /** Panels only: 'window' (default) or 'dock' (the Decorate tray, used beside the tank). */
  layout?: 'window' | 'dock';
  /** panel (Shop, Settings…) or dialog (confirmations, celebrations: centred, always fits). Defaults by `layer`. */
  kind?: 'panel' | 'dialog';
}

export function Sheet(props: SheetProps) {
  const kind = props.kind ?? (props.layer && props.layer !== 'sheet' ? 'dialog' : 'panel');
  if (kind === 'dialog') {
    return (
      <Dialog
        title={props.title}
        onClose={props.onClose}
        footer={props.footer}
        headerExtra={props.headerExtra}
        layer={props.layer}
        ariaLabel={props.ariaLabel}
        role={props.role}
        className={props.className}
        plainHeader={props.plainHeader}
        scrollKey={props.scrollKey}
      >
        {props.children}
      </Dialog>
    );
  }
  return (
    <Panel
      title={props.title}
      onClose={props.onClose}
      footer={props.footer}
      headerExtra={props.headerExtra}
      tabs={props.tabs}
      ariaLabel={props.ariaLabel}
      className={props.className}
      plainHeader={props.plainHeader}
      scrollKey={props.scrollKey}
      modal={props.modal}
      collapsed={props.collapsed}
      snap={props.snap}
      layout={props.layout}
      size={props.size}
    >
      {props.children}
    </Panel>
  );
}
