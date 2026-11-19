// Puts the touch parts on a workspace (BF-D-050, BF-D-051): the search box and the one column in both layouts, and in the phone
// layout the modes, the foot bar, pick-then-move, the action bar, adding a block by a tap and the keyboard rule.
// index.js calls it once for each workspace it makes.

import * as Blockly from "blockly";
import { attachFind } from "./find.js";
import { attachPick } from "./pick.js";
import { addBlock } from "./add.js";
import { Dock } from "./dock.js";
import { Column } from "./column.js";
import { Modes, toolboxVisibility, watchPresses, resetView, modeOf } from "./modes.js";
import { FootBar } from "./foot.js";
import { keepAboveKeyboard } from "./keyboard.js";
import { SEARCH_CATEGORY } from "./blocks/register.js";
import { attachHeld } from "./held.js";

const START_PAD = 12;      // Reset leaves this many px between the view's edge and the first block

/**
 * `frame` and `stage` (the phone layout) are the elements index.js made: the stage holds Blockly, the frame the stage and
 * the foot bar. `mode` is the mode to start in and `onMode(id)` hears of each change.
 */
export function attach(workspace, { layout, frame = null, stage = null, scroller = null, catalogue = null, mode = "read", onMode = () => {} }) {
  const phone = layout === "phone";
  const column = new Column(workspace);
  workspace.bfColumn = column;            // a fold asks it to put the stacks in order again (fold.js)
  if (layout === "phone-a") {
    // Spike A of BF-D-053: no modes, no search, no dock; the stacks in one column and the held list (held.js)
    const held = attachHeld(workspace, { frame, scroller, stage, catalogue, column });
    column.schedule();
    return {
      picker: null, modes: null, dock: null, find: null, column, held, sync() {}, reset() {},
      dispose() {
        held.dispose();
        column.dispose();
      },
    };
  }
  const find = attachFind(workspace, { layout });
  let picker = null;
  let modes = null;
  let foot = null;
  let stopKeyboard = () => {};
  let last = "";
  const dock = new Dock(workspace, {
    phone,
    actions: {
      delete: () => picker?.deletePicked(),
      done: () => picker?.clear(),
      search: (text) => { find.query(text); dock.place(); },
    },
  });
  const flyoutOpen = () => !!workspace.getFlyout()?.isVisible();
  // Blockly's toolbox flyout closes itself ("autoClose") when a block is taken out of it or the focus leaves it, and a tap
  // on one of its blocks then copies the block to the workspace with no click event. It stays open, and a tap is a click,
  // on a phone (adding by a tap, several in a row) and, in both layouts, while the search is open (typing in the box is
  // the focus leaving the flyout). A tap on empty space closes it (see below). Blockly counts a flyout that does not close
  // itself as part of the screen's frame, and leaves its height out of the workspace's view even when it is hidden, so
  // it is kept open only while it is shown: closed, it closes itself again.
  const keepOpen = () => {
    const flyout = workspace.getFlyout();
    const autoClose = !(flyoutOpen() && (phone || find.isOpen()));
    if (flyout && flyout.autoClose !== autoClose) flyout.setAutoClose(autoClose);
  };
  const closeList = () => {
    if (flyoutOpen()) workspace.getToolbox()?.clearSelection();
  };
  const show = () => {
    const info = picker?.info() ?? null;
    // a new answer in the bar goes when what is picked changes
    const sign = info ? `${info.anchor.id}/${info.single}/${info.count}` : "";
    if (sign !== last) { last = sign; dock.message = ""; }
    dock.showPicked(info, flyoutOpen());
  };
  const sync = () => {
    keepOpen();
    dock.showFind(find.isOpen());
    show();
  };
  keepOpen();

  // The bar and the search box lie over the foot of the workspace, so a block just added is brought into view with room
  // for them below it (Blockly's scrollBoundsIntoView knows the flyout, not them).
  // Blockly draws in a batch on the next frame: where the block is, is known once that is done.
  const reveal = async (block) => {
    await Blockly.renderManagement.finishQueuedRenders();
    if (!workspace.rendered || block.isDeadOrDying()) return;
    const box = block.getBoundingRectangle();
    box.bottom += dock.height() / workspace.scale;
    workspace.scrollBoundsIntoView(box, 24);
  };

  const reset = () => {
    resetView(workspace, picker, START_PAD);
    sync();
  };

  if (phone) {
    // Add mode is read-only (modes.js): a tap on a block reaches the workspace as a tap on empty space, and the block is found
    // from where the touch began
    const presses = watchPresses(workspace);
    picker = attachPick(workspace, show, {
      block: (block) => modes.tapBlock(block),
      space: () => {
        const block = presses.take();
        if (block && modes.rules.readOnly) {
          modes.tapBlock(block);
        } else {
          picker.clear();
          closeList();
        }
      },
    });
    modes = new Modes(workspace, {
      picker,
      toolbox: toolboxVisibility(workspace),
      changed: (current) => {
        dock.setMode(current.id);
        foot.show(current);
        sync();
        onMode(current.id);
      },
    });
    foot = new FootBar(frame, stage, {
      mode: (id) => modes.set(id),
      zoom: (direction) => workspace.zoomCenter(direction),
      reset,
    });
    modes.set(modeOf(mode).id);
    // a tap on a block in the flyout adds it (the toolbox's flyout stays open, so several can be added one after another)
    const flyout = workspace.getFlyout().getWorkspace();
    flyout.addChangeListener((event) => {
      if (event.type !== Blockly.Events.CLICK || event.targetType !== "block" || !event.blockId || modes.id !== "add") return;
      const block = flyout.getBlockById(event.blockId)?.getRootBlock();
      if (!block) return;
      const state = Blockly.serialization.blocks.save(block, { addCoordinates: false, addNextBlocks: false });
      const result = addBlock(workspace, picker, state);
      if (result.ok) reveal(result.block);
      else dock.say(result.message);
    });
    stopKeyboard = keepAboveKeyboard(frame, () => {
      Blockly.svgResize(workspace);
      dock.place();
    });
  }
  workspace.addChangeListener((event) => {
    if (event.type === Blockly.Events.TOOLBOX_ITEM_SELECT) sync();
    // a flyout that does not close itself closes on a tap on empty space, as Blockly's own does (on a phone the taps are above)
    else if (!phone && event.type === Blockly.Events.CLICK && event.targetType === "workspace") closeList();
  });
  // After a touch the browser sends mouse events of its own, and their mousedown would put the keyboard's focus on the
  // search's icon, after the box has taken it. Blockly picks a category on pointerdown, so the mousedown has nothing to do.
  const searchIcon = workspace.getToolbox()?.getToolboxItems().find((item) => item.getContents?.() === SEARCH_CATEGORY);
  searchIcon?.getDiv()?.addEventListener("mousedown", (event) => event.preventDefault());
  const place = () => dock.place();
  window.addEventListener("resize", place);
  column.schedule();                      // the blocks that came with the workspace are put in the column
  return {
    picker,
    modes,
    dock,
    find,
    column,
    sync,
    reset,
    dispose() {
      window.removeEventListener("resize", place);
      stopKeyboard();
      foot?.dispose();
      column.dispose();
      dock.dispose();
    },
  };
}
