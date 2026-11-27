// Puts the parts of a layout on a workspace. index.js calls it once for each workspace it makes.
//
//   "wide":  Blockly's own page. The search box that lies over the flyout, and the one column the stacks are kept in (BF-D-050, BF-D-051).
//   "phone": no Blockly page at all: the list of rows (list.js, BF-D-053) over a workspace that is only a model. There is no column to
//            keep, because the rows are in the Python's order by construction.

import * as Blockly from "blockly";
import { attachFind } from "./find.js";
import { SEARCH_CATEGORY } from "./blocks/register.js";
import { Dock } from "./dock.js";
import { Column } from "./column.js";
import { attachList } from "./list.js";

/**
 * `frame`, `scroller` and `rows` (the phone layout) are the elements index.js made; `look` is the look to start in ("blocks" or "code") and `onLook(look)` hears each change of it.
 * Gives {list, column, dispose}; `list` is the phone layout's rows (null in wide), `column` the wide layout's (null in phone).
 */
export function attach(workspace, { layout, frame = null, scroller = null, rows = null, look = "blocks", catalogue = null, onLook = () => {} }) {
  if (layout === "phone") {
    const list = attachList(workspace, { frame, scroller, list: rows, catalogue, look, onLook });
    return { list, column: null, dispose: () => list.dispose() };
  }
  const column = new Column(workspace);
  workspace.bfColumn = column;            // a fold asks it to put the stacks in order again (fold.js)
  const find = attachFind(workspace);
  const dock = new Dock(workspace, { actions: { search: (text) => { find.query(text); dock.place(); } } });
  const flyoutOpen = () => !!workspace.getFlyout()?.isVisible();
  // Blockly's toolbox flyout closes itself ("autoClose") when a block is taken out of it or the focus leaves it. While the search is
  // open it stays open (typing in the box is the focus leaving the flyout). A tap on empty space closes it (see below). Blockly counts a
  // flyout that does not close itself as part of the screen's frame, and leaves its height out of the workspace's view even when it is
  // hidden, so it is kept open only while it is shown: closed, it closes itself again.
  const keepOpen = () => {
    const flyout = workspace.getFlyout();
    const autoClose = !(flyoutOpen() && find.isOpen());
    if (flyout && flyout.autoClose !== autoClose) flyout.setAutoClose(autoClose);
  };
  const closeList = () => {
    if (flyoutOpen()) workspace.getToolbox()?.clearSelection();
  };
  const sync = () => {
    keepOpen();
    dock.showFind(find.isOpen());
  };
  keepOpen();

  workspace.addChangeListener((event) => {
    if (event.type === Blockly.Events.TOOLBOX_ITEM_SELECT) sync();
    // a flyout that does not close itself closes on a tap on empty space, as Blockly's own does
    else if (event.type === Blockly.Events.CLICK && event.targetType === "workspace") closeList();
  });
  // After a touch the browser sends mouse events of its own, and their mousedown would put the keyboard's focus on the
  // search's icon, after the box has taken it. Blockly picks a category on pointerdown, so the mousedown has nothing to do.
  const searchIcon = workspace.getToolbox()?.getToolboxItems().find((item) => item.getContents?.() === SEARCH_CATEGORY);
  searchIcon?.getDiv()?.addEventListener("mousedown", (event) => event.preventDefault());
  const place = () => dock.place();
  window.addEventListener("resize", place);
  column.schedule();                      // the blocks that came with the workspace are put in the column
  return {
    list: null,
    column,
    dock,
    dispose() {
      window.removeEventListener("resize", place);
      column.dispose();
      dock.dispose();
    },
  };
}
