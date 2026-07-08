import blessed from "blessed";
import { format, callbackify } from "util";
import chalk from "chalk";

import { TreeItem } from "../widget/tree_item.js";
import { ClientAlarmList, NodeId, resolveNodeId, sameNodeId, VariantArrayType } from "node-opcua-client";

import { Tree } from "../widget/widget_tree.js";
import { Model, NodeChild } from "../model/model.js";
import { updateAlarmBox } from "./alarm_box.js";
import { w } from "../utils/utils.js";

const w2 = "40%";

const scrollbar = {
  ch: " ",
  track: {
    bg: "cyan",
  },
  style: {
    inverse: true,
  },
};

const style = {
  focus: {
    border: {
      fg: "yellow",
    },
    bold: false,
  },
  item: {
    hover: {
      bg: "blue",
    },
  },
  selected: {
    bg: "blue",
    bold: true,
  },
};


export function makeItems(arr: any[], width: number): string[] {
  return arr.map((a) => {
    return w(a[0], 25, ".") + ": " + w(a[1], width, " ");
  });
}

let refreshTimer: NodeJS.Timeout | null = null;

export class View {
  private monitoredItemsList: any;
  private $headers: string[] = [];

  public screen!: blessed.Widgets.Screen;
  public area1!: blessed.Widgets.BoxElement;
  public area2!: blessed.Widgets.BoxElement;
  public menuBar!: blessed.Widgets.ListbarElement;
  public alarmBox?: blessed.Widgets.ListTableElement;
  public attributeList!: blessed.Widgets.ListElement;
  public attributeListNodeId?: NodeId;
  public logWindow!: blessed.Widgets.ListElement;
  public tree!: Tree;
  public writeForm!: blessed.Widgets.BoxElement;
  public valuesToWriteElement!: blessed.Widgets.TextboxElement;
  public filterForm!: blessed.Widgets.BoxElement;
  public filterInputElement!: blessed.Widgets.TextboxElement;
  public referenceList!: blessed.Widgets.ListElement;
  public referenceListHelp!: blessed.Widgets.TextElement;
  public treeHelp!: blessed.Widgets.TextElement;
  public monitoredItemsHelp!: blessed.Widgets.TextElement;
  public logWindowHelp!: blessed.Widgets.TextElement;

  private _history: NodeId[][] = [];
  private _historyIndex = -1;
  private _isPushingToHistory = false;
  private _referenceFilter: "both" | "forward" | "backward" = "both";

  public model: Model;

  constructor(model: Model) {
    this.model = model;

    // Create a screen object.
    this.screen = blessed.screen({
      smartCSR: true,
      autoPadding: false,
      fullUnicode: true,
      title: "OPCUA CLI-Client",
    });
    // create the main area
    this.area1 = blessed.box({
      top: 0,
      left: 0,
      width: "100%",
      height: "90%-10",
    });
    this.area2 = blessed.box({
      top: "90%-9",
      left: 0,
      width: "100%",
      height: "shrink",
    });

    this.screen.append(this.area1);

    this.screen.append(this.area2);

    this.attributeList = this.install_attributeList();
    this.referenceList = this.install_referenceList();
    this.install_monitoredItemsWindow();
    this.install_writeFormWindow();
    this.tree = this.install_address_space_explorer();
    this.install_filterFormWindow();
    this.logWindow = this.install_logWindow();
    this.menuBar = this.install_mainMenu();
    
    // Global focus cycling
    this.screen.key(["tab"], () => {
      if (this.screen.focused === this.tree) {
        if (this.attributeList.visible) {
            this.attributeList.focus();
        } else {
            this.referenceList.focus();
        }
      } else if (this.screen.focused === this.attributeList || this.screen.focused === this.referenceList) {
        this.monitoredItemsList.focus();
      } else if (this.screen.focused === this.monitoredItemsList) {
        this.logWindow.focus();
      } else {
        this.tree.focus();
      }
    });
    this.screen.key(["S-tab"], () => {
      if (this.screen.focused === this.tree) {
        this.logWindow.focus();
      } else if (this.screen.focused === this.logWindow) {
        this.monitoredItemsList.focus();
      } else if (this.screen.focused === this.monitoredItemsList) {
        if (this.attributeList.visible) {
            this.attributeList.focus();
        } else {
            this.referenceList.focus();
        }
      } else {
        this.tree.focus();
      }
    });

    // Global Help Command
    this.screen.key(["f1", "?"], () => {
      if (this.screen.focused === this.filterInputElement) {
        return;
      }
      this._showHelpDialog();
    });

    // Render the screen.
    this.screen.render();
  }

  install_writeFormWindow() {
    this.writeForm = blessed.box({
      parent: this.area1,
      tags: true,
      top: "50%",
      left: w2 + "+1",
      width: "60%-1",
      height: "50%",
      keys: true,
      mouse: true,
      label: " Write item ",
      border: "line",
      scrollbar: scrollbar,
      noCellBorders: true,
      style: { ...style },
      align: "left",
      hidden: true,
    });

    {
      const form = blessed.form({
        parent: this.writeForm,
        width: "100%-2",
        height: "100%-2",
        top: 1,
        left: 1,
        keys: true,
      });

      blessed.text({
        parent: form,
        top: 0,
        left: 0,
        content: "VALUES (Comma separated for array):",
      });

      this.valuesToWriteElement = blessed.textbox({
        parent: form,
        name: "valuesToWrite",
        top: 1,
        left: 0,
        height: "100%-2",
        inputOnFocus: true,
        mouse: false,
        vi: false,
        keys: false,
        content: "",
        border: {
          type: "line",
        },
        focus: {
          fg: "blue",
        },
      });

      const padding = {
        top: 0,
        right: 2,
        bottom: 0,
        left: 2,
      };
      const buttonTop = "100%-1";
      var submit = blessed.button({
        parent: form,
        name: "submit",
        content: "Submit",
        top: buttonTop,
        left: 0,
        shrink: true,
        mouse: true,
        padding,
        style: {
          bold: true,
          fg: "white",
          bg: "green",
          focus: {
            inverse: true,
          },
        },
      });
      submit.on("press", function () {
        form.submit();
      });

      var closeForm = blessed.button({
        parent: form,
        name: "close",
        content: "close",
        top: buttonTop,
        right: 0,
        shrink: true,
        mouse: true,
        padding,
        style: {
          bold: true,
          fg: "white",
          bg: "red",
          focus: {
            inverse: true,
          },
        },
      });
      closeForm.on("press", () => {
        this.writeForm.hide();
        this.screen.render();
      });

      const writeResultMsg = blessed.text({
        parent: form,
        top: submit.top,
        left: "center",
        content: "",
      });

      form.on("submit", async (data: any) => {
        const treeItem = this.tree.getSelectedItem();
        if (treeItem.node) {
          // check if it is an array
          const dataValues = await this.model.readNode(treeItem.node);
          let valuesToWrite = data.valuesToWrite;

          if (dataValues && dataValues.value) {
            if (dataValues.value.arrayType == VariantArrayType.Array) {
              // since it is an array I will split by comma
              valuesToWrite = valuesToWrite.split(",");
            }
          }

          // send data to opc
          const res = await this.model.writeNode(treeItem.node, valuesToWrite);
          if (res.valueOf() == 0) {
            writeResultMsg.setContent("Write successful");
          } else {
            writeResultMsg.setContent("Write error");
          }
          this.screen.render();
        }
      });
    }

    this.area1.append(this.writeForm);
  }

  private matchNode(node: any, query: string): boolean {
    if (!node) return false;
    const q = query.toLowerCase();
    const displayName = (node.displayName || "").toLowerCase();
    const name = (node.name || "").toLowerCase();
    const nodeIdStr = (node.nodeId ? node.nodeId.toString() : "").toLowerCase();
    const typeDef = (node.typeDefinitionName || "").toLowerCase();

    return displayName.includes(q) || name.includes(q) || nodeIdStr.includes(q) || typeDef.includes(q);
  }

  private findMatch(tree: Tree, query: string, startIndex: number, direction: "down" | "up" = "down"): number {
    const items = (tree as any).items || [];
    if (items.length === 0 || !query) return -1;

    const total = items.length;
    let step = direction === "down" ? 1 : -1;

    for (let i = 0; i < total; i++) {
      const idx = (startIndex + i * step + total) % total;
      const item = items[idx];
      if (item && item.node && this.matchNode(item.node, query)) {
        return idx;
      }
    }
    return -1;
  }

  private updateTreeHelp(searchActive: boolean = false): void {
    if (this.treeHelp) {
      if (searchActive) {
        this.treeHelp.setContent(" [f] or [/]  {yellow-fg}Cycle:{/yellow-fg} [F3]/[S-F3]  {yellow-fg}Clear:{/yellow-fg} [Ctrl-U]  {yellow-fg}Node ID:{/yellow-fg} ns=/nsu=");
      } else {
        this.treeHelp.setContent(" [↑/↓] Nav  [→/+] Exp  [←/-] Coll  [f] Find  [m] Mon");
      }
    }
  }

  private _showHelpDialog(): void {
    const previousFocus = this.screen.focused;

    const helpBox = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: 70,
      height: 22,
      border: "line",
      label: " {bold}{cyan-fg}OPC UA Commander Help{/cyan-fg}{/bold} ",
      tags: true,
      style: {
        border: {
          fg: "cyan",
        },
        bg: "black",
        fg: "white",
      },
      keys: true,
      vi: true,
      scrollable: true,
      scrollbar: {
        ch: " ",
        track: {
          bg: "cyan",
        },
        style: {
          inverse: true,
        },
      },
    });

    const helpText = `
 {bold}{yellow-fg}Global Shortcuts{/yellow-fg}{/bold}
   {bold}Tab{/bold}       : Cycle Focus Forward
   {bold}Shift-Tab{/bold} : Cycle Focus Backward
   {bold}w{/bold}         : Write Value
   {bold}k{/bold}         : Call Method
   {bold}s{/bold}         : Show Statistics
   {bold}a{/bold}         : Toggle Alarms
   {bold}r{/bold}         : Toggle Reference / Attribute view
   {bold}[{/bold}         : History Back
   {bold}]{/bold}         : History Forward
   {bold}h{/bold}         : Toggle Subtype Mode
   {bold}q / x{/bold}     : Exit Application

 {bold}{yellow-fg}Tree Explorer{/yellow-fg}{/bold}
   {bold}↑ / ↓{/bold}     : Navigate Nodes
   {bold}→ / +{/bold}     : Expand Node
   {bold}← / -{/bold}     : Collapse Node
   {bold}f / /{/bold}     : Find / Filter Nodes
   {bold}m{/bold}         : Monitor Node

   {bold}{yellow-fg}Search Bar (when active){/yellow-fg}{/bold}
     {bold}F3{/bold}        : Next Search Match
     {bold}Shift-F3{/bold}  : Previous Search Match
     {bold}Ctrl-U{/bold}    : Clear Search Input
     {bold}Enter{/bold}     : Locate Node ID (ns=/nsu=) or Close Search
     {bold}Escape{/bold}    : Cancel Search

 {bold}{yellow-fg}Monitored Items{/yellow-fg}{/bold}
   {bold}u{/bold}         : Unmonitor Selected Item

 {bold}{yellow-fg}Info Log Window{/yellow-fg}{/bold}
   {bold}c{/bold}         : Clear Log

 {bold}{yellow-fg}References Window{/yellow-fg}{/bold}
   {bold}f{/bold}         : Show Forward References
   {bold}b{/bold}         : Show Backward References
   {bold}a{/bold}         : Show All References

 {yellow-fg}Press [Escape], [Enter], or [Space] to close this help window.{/yellow-fg}
`;

    const contentBox = blessed.box({
      parent: helpBox,
      top: 0,
      left: 1,
      width: "100%-4",
      height: "100%-2",
      content: helpText,
      tags: true,
      scrollable: true,
      keys: true,
      vi: true,
    });

    const closeHelp = () => {
      helpBox.destroy();
      if (previousFocus) {
        previousFocus.focus();
      }
      this.screen.render();
    };

    helpBox.key(["escape", "enter", "space"], closeHelp);
    contentBox.key(["escape", "enter", "space"], closeHelp);

    this.screen.append(helpBox);
    helpBox.focus();
    this.screen.render();
  }

  private activateSearch(): void {
    this.filterForm.show();
    this.area1.append(this.filterForm);
    this.updateTreeHelp(true);
    this.filterInputElement.focus();
    this.screen.render();
  }

  private performSearch(query: string, startIndex: number, direction: "down" | "up"): void {
    const matchIndex = this.findMatch(this.tree, query, startIndex, direction);
    if (matchIndex >= 0) {
      this.filterInputElement.style.fg = "white";
      this.tree.select(matchIndex);
      this.tree.scrollTo(matchIndex);
    } else {
      this.filterInputElement.style.fg = "red";
    }
    this.screen.render();
  }

  install_filterFormWindow() {
    this.filterForm = blessed.box({
      parent: this.area1,
      top: 1,
      left: 1,
      width: "40%-2",
      height: 1,
      style: {
        bg: "blue",
      },
      hidden: true,
    });

    const searchLabel = blessed.text({
      parent: this.filterForm,
      top: 0,
      left: 1,
      width: 8,
      height: 1,
      content: "Search:",
      style: {
        bg: "blue",
        fg: "yellow",
        bold: true,
      },
    });

    this.filterInputElement = blessed.textbox({
      parent: this.filterForm,
      name: "filterPattern",
      top: 0,
      left: 9,
      width: "100%-10",
      height: 1,
      inputOnFocus: true,
      style: {
        bg: "blue",
        fg: "white",
      },
    });

    this.filterInputElement.on("keypress", (ch: any, key: any) => {
      process.nextTick(() => {
        const query = this.filterInputElement.getValue().trim();
        const isNodeIdPattern = /^(ns|nsi|nsu|s|i)=/i.test(query);
        if (query) {
          if (isNodeIdPattern) {
            this.filterInputElement.style.fg = "yellow";
            this.screen.render();
          } else {
            this.filterInputElement.style.fg = "white";
            this.performSearch(query, this.tree.getSelectedIndex(), "down");
          }
        } else {
          this.filterInputElement.style.fg = "white";
          this.screen.render();
        }
      });
    });

    this.filterInputElement.key(["escape"], () => {
      this.tree.focus();
    });

    this.filterInputElement.key(["C-u"], () => {
      this.filterInputElement.setValue("");
      this.filterInputElement.style.fg = "white";
      this.screen.render();
    });

    this.filterInputElement.key(["enter"], async () => {
      const query = this.filterInputElement.getValue().trim();
      const isNodeIdPattern = /^(ns|nsi|nsu|s|i)=/i.test(query);

      if (isNodeIdPattern) {
        this.filterInputElement.style.fg = "yellow";
        this.screen.render();

        try {
          const resolvedNodeId = await this.model.parseNodeId(query);
          
          const exists = await this.model.nodeExists(resolvedNodeId);
          if (!exists) {
            throw new Error(`Node ID '${resolvedNodeId.toString()}' does not exist on the server.`);
          }

          const path = await this.model.findPathToRoot(resolvedNodeId);
          const rootFolderId = resolveNodeId("RootFolder");
          const reachedRoot = path.length > 0 && sameNodeId(path[0], rootFolderId);

          if (!reachedRoot) {
            this.filterInputElement.style.fg = "orange";
            this.screen.render();
            console.log(
              chalk.yellow(
                `[GoTo] Warning: Could not find path to root for node '${resolvedNodeId.toString()}'. The server may not support inverse hierarchical browse.`
              )
            );
            return; // keep focus on search box in orange state so they see the warning
          }

          await this.tree.expandPath(path);
          this.filterInputElement.style.fg = "white";
        } catch (err: any) {
          this.filterInputElement.style.fg = "red";
          this.screen.render();
          console.log(chalk.red(`[GoTo] Error: ${err.message || err}`));
          return; // keep focus on search box in red state so they see the error
        }
      }

      this.tree.focus();
    });

    this.filterInputElement.on("blur", () => {
      this.filterForm.hide();
      this.filterInputElement.style.fg = "white";
      this.updateTreeHelp(false);
      this.screen.render();
    });

    // Bind F3 globally on the screen to find next match
    this.screen.key(["f3"], () => {
      if (this.screen.focused !== this.tree && this.screen.focused !== this.filterInputElement) {
        return;
      }
      const query = this.filterInputElement.getValue().trim();
      if (query && !/^(ns|nsi|nsu|s|i)=/i.test(query)) {
        this.performSearch(query, this.tree.getSelectedIndex() + 1, "down");
      }
    });

    // Bind Shift-F3 globally on the screen to find previous match
    this.screen.key(["S-f3"], () => {
      if (this.screen.focused !== this.tree && this.screen.focused !== this.filterInputElement) {
        return;
      }
      const query = this.filterInputElement.getValue().trim();
      if (query && !/^(ns|nsi|nsu|s|i)=/i.test(query)) {
        this.performSearch(query, this.tree.getSelectedIndex() - 1, "up");
      }
    });

    // Bind keys on the tree directly to ensure search is activated
    // even when the tree intercepts standard screen/listbar keys.
    this.tree.key(["f", "/"], () => {
      this.activateSearch();
    });
  }

  install_monitoredItemsWindow() {
    this.monitoredItemsList = blessed.listtable({
      parent: this.area1,
      tags: true,
      top: "50%",
      left: w2 + "+1",
      width: "60%-1",
      height: "50%",
      keys: true,
      label: " Monitored Items ",
      border: "line",
      scrollbar: scrollbar,
      noCellBorders: true,
      style: { ...style },
      align: "left",
    });
    this.area1.append(this.monitoredItemsList);

    this.monitoredItemsHelp = blessed.text({
      parent: this.area1,
      top: "100%-1",
      left: w2 + "+2",
      width: "60%-3",
      height: 1,
      tags: true,
      content: " {yellow-fg}Actions:{/yellow-fg} [u] Unmonitor",
      style: {
        bg: "black",
        fg: "white",
      },
      hidden: true,
    });
    this.area1.append(this.monitoredItemsHelp);

    this.monitoredItemsList.on("focus", () => {
      this.monitoredItemsHelp.show();
      this.screen.render();
    });
    this.monitoredItemsList.on("blur", () => {
      this.monitoredItemsHelp.hide();
      this.screen.render();
    });

    this.monitoredItemsList.key(["u"], () => {
      this._onUnmonitoredSelectedItem();
    });

    this.model.on("monitoredItemListUpdated", (monitoredItemsListData: any) => {
      if (monitoredItemsListData.length > 0) {
        this.monitoredItemsList.setRows(monitoredItemsListData);
      } else {
        // when using setRows with empty array, the view does not update.
        // setting an empty row.
        const empty = [[" "]];
        this.monitoredItemsList.setRows(empty);
      }
      this.monitoredItemsList.render();
    });

    this.model.on("monitoredItemChanged", this._onMonitoredItemChanged.bind(this));

    this.model.on("nodeChanged", this._onNodeChanged.bind(this));
  }
  private _onMonitoredItemChanged(monitoredItemsListData: any /*node: any, dataValue: DataValue*/) {
    this.monitoredItemsList.setRows(monitoredItemsListData);
    this.monitoredItemsList.render();
  }

  private install_logWindow() {
    const logWindow = blessed.list({
      parent: this.area2,
      tags: true,
      label: " {bold}{cyan-fg}Info{/cyan-fg}{/bold} ",
      top: "top",
      left: "left",
      width: "100%",
      height: "100%-2",
      keys: true,
      border: "line",
      scrollable: true,
      scrollbar: {
        ch: " ",
        track: {
          bg: "cyan",
        },
        style: {
          inverse: true,
        },
      },
      style: { ...style },
    });

    this.area2.append(logWindow);

    this.logWindowHelp = blessed.text({
      parent: this.area2,
      top: "100%-3",
      left: 2,
      width: "100%-4",
      height: 1,
      tags: true,
      content: " {yellow-fg}Actions:{/yellow-fg} [c] Clear",
      style: {
        bg: "black",
        fg: "white",
      },
      hidden: true,
    });
    this.area2.append(this.logWindowHelp);

    logWindow.on("focus", () => {
      this.logWindowHelp.show();
      this.screen.render();
    });
    logWindow.on("blur", () => {
      this.logWindowHelp.hide();
      this.screen.render();
    });

    logWindow.key(["c"], () => {
      logWindow.clearItems();
      logWindow.screen.render();
    });

    return logWindow;
  }

  public install_mainMenu(): blessed.Widgets.ListbarElement {
    const menuBarOptions: blessed.Widgets.ListbarOptions = {
      parent: this.area2,
      top: "100%-2",
      left: "left",
      width: "100%",
      height: 2,
      keys: true,
      style: {
        ...style,
        prefix: {
          fg: "cyan",
        },
      } as any,
      //xx label: " {bold}{cyan-fg}Info{/cyan-fg}{/bold}",
      //xx border: "line",
      bg: "cyan",
      commands: [],
      items: [],
      autoCommandKeys: true,
    };
    const menuBar = blessed.listbar(menuBarOptions);
    this.area2.append(menuBar);

    (menuBar as any).setItems({
      Help: {
        keys: ["?", "f1"],
        callback: () => this._showHelpDialog(),
      },
      Write: {
        keys: ["w"],
        callback: () => this._onWriteSelectedItem(),
      },
      Exit: {
        keys: ["q", "x"], //["C-c", "escape"],
        callback: () => this._onExit(),
      },
      Stat: {
        keys: ["s"],
        callback: () => this._onDumpStatistics(),
      },
      Alarm: {
        keys: ["a"],
        callback: () => {
          if (this.screen.focused !== this.referenceList) {
            this._onToggleAlarmWindows();
          }
        },
      },
      Call: {
        keys: ["k"],
        callback: () => this._onCallMethodSelectedItem(),
      },
      Reference: {
        keys: ["r"],
        callback: () => this._toggleAttributeReference(),
      },
      Back: {
        keys: ["["],
        callback: () => this._historyBack(),
      },
      Forward: {
        keys: ["]"],
        callback: () => this._historyForward(),
      },
      Subtype: {
        keys: ["h"],
        callback: () => {
          this.model.subtypeMode = !this.model.subtypeMode;
          this.populateTree();
        },
      },
    });
    return menuBar;
  }

  private install_address_space_explorer(): Tree {
    this.tree = new Tree({
      parent: this.area1,
      tags: true,
      fg: "green",
      //Xx keys: true,
      label: " {bold}{cyan-fg}Address Space{/cyan-fg}{/bold} ",
      top: "top",
      left: "left",
      width: "40%",
      height: "100%",
      keys: true,
      vi: true,
      mouse: true,
      border: "line",
      style: { ...style },
      showNamespace: this.model.showNamespace,
    });

    //allow control the table with the keyboard
    this.tree.on("select", (treeItem: any) => {
      if (treeItem) {
        this.fill_attributesRegion(treeItem.node.nodeId);
      }
    });
    this.tree.on("keypress", (ch: any, key: any) => {
      if (key.name === "up" || key.name === "down") {
        if (refreshTimer) {
          return;
        }
        refreshTimer = setTimeout(() => {
          const treeItem = this.tree.getSelectedItem();
          if (treeItem && treeItem.node) {
            this.fill_attributesRegion(treeItem.node.nodeId);
          }
          refreshTimer = null;
        }, 100);
      }
    });

    this.area1.append(this.tree);

    this.treeHelp = blessed.text({
      parent: this.area1,
      top: "100%-1",
      left: 1,
      width: "40%-2",
      height: 1,
      tags: true,
      content: "",
      style: {
        bg: "black",
        fg: "white",
      },
      hidden: false,
    });
    this.area1.append(this.treeHelp);
    this.updateTreeHelp(false);

    this.tree.on("focus", () => {
      this.treeHelp.show();
      this.screen.render();
    });
    this.tree.on("blur", () => {
      if (this.filterForm && !this.filterForm.hidden) {
        return;
      }
      this.treeHelp.hide();
      this.screen.render();
    });

    this.tree.key(["m"], () => {
      this._onMonitoredSelectedItem();
    });

    this.populateTree();
    this.tree.focus();
    return this.tree;
  }

  private populateTree() {
    this.tree.setData({
      name: "RootFolder",
      nodeId: resolveNodeId("RootFolder"),
      children: this.expand_opcua_node.bind(this),
    });
  }

  private expand_opcua_node(node: any, callback: () => void) {
    async function f(this: any, node: any) {
      try {
        let children = await this.model.expand_opcua_node(node);

        // we sort the childrens by displayName alphabetically
        children = children.sort((a: NodeChild, b: NodeChild) => {
          return a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0;
        });

        const results = children.map((c: any) => new TreeItem({ ...c, children: this.expand_opcua_node.bind(this) }));
        return results;
      } catch (err) {
        throw new Error("cannot expand");
      }
    }
    callbackify(f).call(this, node, callback);
  }

  private _onNodeChanged(nodeId: NodeId) {
    if (this.attributeListNodeId && sameNodeId(this.attributeListNodeId, nodeId)) {
      // we need to refresh the attribute list
      this.fill_attributesRegion(nodeId);
    }
  }

  private async fill_attributesRegion(nodeId: NodeId, path?: NodeId[]) {
    if (!path) {
      const treeItem = this.tree.getSelectedItem();
      if (treeItem && treeItem.node && sameNodeId(treeItem.node.nodeId, nodeId)) {
        path = this._getPathToRoot(treeItem.node);
      } else {
        path = [nodeId];
      }
    }
    this._pushToHistory(path);
    this.fill_referencesRegion(nodeId); // async but don't wait
    type ATT = [string, string];
    const attr: ATT[] = [];

    function append_text(prefix: string, s: string, attr: ATT[]) {
      const a = s.split("\n");
      if (a.length === 1) {
        attr.push([prefix, s]);
      } else {
        attr.push([prefix, a[0]]);
        for (let j = 1; j < a.length; j++) {
          attr.push(["   |    ", a[j]]);
        }
      }
    }

    const attributes = await this.model.readNodeAttributes(nodeId);
    if (attributes.length === 0) {
      return;
    }
    for (const r of attributes) {
      append_text(r.attribute, r.text, attr);
    }
    const width = (this.attributeList as any).width - 28;
    this.attributeList.setItems(makeItems(attr, width) as any);
    this.attributeList.screen.render();
    this.attributeListNodeId = nodeId;
  }

  private install_referenceList(): blessed.Widgets.ListElement {
    this.referenceList = blessed.list({
      parent: this.area1,
      label: " {bold}{cyan-fg}Reference List{/cyan-fg}{/bold} ",
      top: 0,
      tags: true,
      left: w2 + "+1",
      width: "60%-1",
      height: "50%",
      border: "line",
      scrollbar: scrollbar,
      style: { ...style },
      align: "left",
      keys: true,
      hidden: true,
    });
    this.area1.append(this.referenceList);

    this.referenceListHelp = blessed.text({
      parent: this.area1,
      top: "50%-1",
      left: w2 + "+2",
      width: "60%-3",
      height: 1,
      tags: true,
      content: " {yellow-fg}Filter:{/yellow-fg} [f] Forward  [b] Backward  [a] All",
      style: {
        bg: "black",
        fg: "white",
      },
      hidden: true,
    });
    this.area1.append(this.referenceListHelp);

    this.referenceList.on("focus", () => {
      this.referenceListHelp.show();
      this.screen.render();
    });
    this.referenceList.on("blur", () => {
      this.referenceListHelp.hide();
      this.screen.render();
    });

    this.referenceList.on("select", (item: any, index: number) => {
      const nodeIds = (this.referenceList as any)._nodeIds;
      if (nodeIds && nodeIds[index]) {
        this._jumpToNode(nodeIds[index]);
      }
    });

    this.referenceList.key(["f"], () => {
        this._referenceFilter = "forward";
        const treeItem = this.tree.getSelectedItem();
        if (treeItem && treeItem.node) {
            this.fill_referencesRegion(treeItem.node.nodeId);
        }
    });
    this.referenceList.key(["b"], () => {
        this._referenceFilter = "backward";
        const treeItem = this.tree.getSelectedItem();
        if (treeItem && treeItem.node) {
            this.fill_referencesRegion(treeItem.node.nodeId);
        }
    });
    this.referenceList.key(["a"], () => {
        this._referenceFilter = "both";
        const treeItem = this.tree.getSelectedItem();
        if (treeItem && treeItem.node) {
            this.fill_referencesRegion(treeItem.node.nodeId);
        }
    });

    return this.referenceList;
  }

  private async fill_referencesRegion(nodeId: NodeId) {
    let references = await this.model.browseReferences(nodeId);
    
    // Filtering
    if (this._referenceFilter === "forward") {
        references = references.filter(r => r.isForward);
    } else if (this._referenceFilter === "backward") {
        references = references.filter(r => !r.isForward);
    }

    const blessedColors = [
        "white", "cyan", "green", "yellow", "magenta", "blue", "red",
        "light-cyan", "light-green", "light-yellow", "light-magenta", "light-blue", "light-red"
    ];

    const enrichedReferences = await Promise.all(references.map(async (ref) => {
      const direc = ref.isForward ? "->" : "<-";
      const refTypeNodeId = NodeId.resolveNodeId(ref.referenceTypeId);
      const refTypeName = await this.model.getBrowseNameMaybe(refTypeNodeId);
      const target = ref.browseName.toString();
      return { ref, direc, refTypeName, target };
    }));

    enrichedReferences.sort((a, b) => {
      const cmpDirec = a.direc.localeCompare(b.direc);
      if (cmpDirec !== 0) return cmpDirec;
      const cmpRefType = a.refTypeName.localeCompare(b.refTypeName);
      if (cmpRefType !== 0) return cmpRefType;
      return a.target.localeCompare(b.target);
    });

    (this.referenceList as any)._nodeIds = enrichedReferences.map((item) => NodeId.resolveNodeId(item.ref.nodeId));

    const items = enrichedReferences.map((item) => {
      const ref = item.ref;
      const ns = ref.nodeId.namespace;
      const color = blessedColors[ns % blessedColors.length];
      const browseName = `{${color}-fg}${item.target}{/${color}-fg}`;
      const nodeIdStr = chalk.grey(`(${ref.nodeId.toString()})`);
      return ` ${item.direc} ${item.refTypeName} : ${browseName} ${nodeIdStr}`;
    });
    
    const filterLabel = this._referenceFilter.toUpperCase();
    this.referenceList.setLabel(` {bold}{cyan-fg}References [${filterLabel}]{/cyan-fg}{/bold} `);
    this.referenceList.setItems(items as any);
    this.screen.render();
  }

  private install_attributeList(): blessed.Widgets.ListElement {
    this.attributeList = blessed.list({
      parent: this.area1,
      label: " {bold}{cyan-fg}Attribute List{/cyan-fg}{/bold} ",
      top: 0,
      tags: true,
      left: w2 + "+1",
      width: "60%-1",
      height: "50%",
      border: "line",
      // noCellBorders: true,
      scrollbar: scrollbar,
      style: { ...style },
      align: "left",
      keys: true,
    });
    this.area1.append(this.attributeList);

    const width = (this.attributeList as any).width - 28;
    this.attributeList.setItems(makeItems([], width) as any);
    return this.attributeList;
  }

  private install_alarm_windows() {
    if (this.alarmBox) {
      this.alarmBox.show();
      this.alarmBox.focus();
      return;
    }

    this.alarmBox = blessed.listtable({
      parent: this.area1,
      tags: true,
      fg: "green",
      // label: "{bold}{cyan-fg}Alarms - Conditions {/cyan-fg}{/bold} ",
      label: "Alarms - Conditions",
      top: "top+6",
      left: "left+2",
      width: "100%-10",
      height: "100%-10",
      keys: true,
      border: "line",
      scrollbar: scrollbar,
      noCellBorders: false,
      style: { ...style }!,
      align : "left"
    });

    this.$headers = [
      "EventType",
      "ConditionId",
      "SourceName",
      // "BranchId",
      // "EventId",
      "Message",
      "Severity",
      //"Enabled?", "Active?",  "Acked?", "Confirmed?", "Retain",
      "E!AC",
      "Comment",
    ];

    const data = [this.$headers];

    this.alarmBox.setData(data);

    this.model.installAlarmMonitoring();
    this.model.on("alarmChanged", (list: ClientAlarmList) => updateAlarmBox(list, this.alarmBox!, this.$headers, this.model));
    this.alarmBox.focus();
  }

  private hide_alarm_windows() {
    this.alarmBox!.hide();
  }

  private async _onExit() {
    console.log(chalk.red(" disconnecting .... "));
    await this.model.disconnect();
    console.log(chalk.green(" disconnected .... "));
    await new Promise((resolve) => setTimeout(resolve, 1000));

    process.exit(0);
  }

  private async _onToggleAlarmWindows() {
    if (this.alarmBox && this.alarmBox.visible) {
      this.hide_alarm_windows();
    } else {
      this.install_alarm_windows();
      this.alarmBox!.show();
    }
    this.screen.render();
  }

  private async _onMonitoredSelectedItem() {
    const treeItem = this.tree.getSelectedItem();
    if (treeItem.node.monitoredItem) {
      console.log(" Already monitoring ", treeItem.node.nodeId.toString());
      return;
    }
    await this.model.monitor_item(treeItem);
  }
  private async _onWriteSelectedItem() {
    this.writeForm.show();
    const treeItem = this.tree.getSelectedItem();
    if (treeItem.node) {
      const treeItemToUse = this.model.request_write_item(treeItem);
      if (treeItemToUse) {
        const value = await this.model.readNodeValue(treeItem.node);
        if (value) {
          this.valuesToWriteElement.setValue(value);
        } else {
          this.valuesToWriteElement.setValue("");
        }
        this.screen.render();
        this.valuesToWriteElement.focus();
        this.screen.render();
      }
      return;
    }
  }

  private _onUnmonitoredSelectedItem() {
    const treeItem = this.tree.getSelectedItem();
    if (!treeItem.node.monitoredItem) {
      console.log(treeItem.node.nodeId.toString(), " was not being monitored");
      return;
    }
    this.model.unmonitor_item(treeItem);
  }

  private async _onDumpStatistics() {
    console.log("-----------------------------------------------------------------------------------------");
    console.log(chalk.green("     transaction count   : ", chalk.yellow(this.model.data.transactionCount)));
    console.log(chalk.green("            sent bytes   : ", chalk.yellow(this.model.data.sentBytes)));
    console.log(chalk.green("        received bytes   : ", chalk.yellow(this.model.data.receivedBytes)));
    console.log(chalk.green("   token renewal count   : ", chalk.yellow(this.model.data.tokenRenewalCount)));
    console.log(chalk.green("    reconnection count   : ", chalk.yellow(this.model.data.reconnectionCount)));
    console.log("-----------------------------------------------------------------------------------------");
    const treeItem = this.tree.getSelectedItem();
    const browsePath = await this.model.extractBrowsePath(treeItem.node.nodeId);
    console.log(chalk.cyan("selected node browse path :", chalk.magenta(browsePath)));
  }

  public async run(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.screen.on("destroy", resolve);
    });
  }

  private async _onCallMethodSelectedItem() {
    const treeItem = this.tree.getSelectedItem();
    if (!treeItem || !treeItem.node) return;
    console.log(" Call Method on ", treeItem.node.nodeId.toString());
    // TODO: Implement method call
  }

  private _getPathToRoot(node: any): NodeId[] {
    const path: NodeId[] = [];
    let current = node;
    while (current) {
      if (current.nodeId) {
        path.unshift(current.nodeId);
      }
      current = current.parent;
    }
    return path;
  }

  private _pushToHistory(path: NodeId[]) {
    if (this._isPushingToHistory) return;
    if (this._historyIndex >= 0) {
      const currentPath = this._history[this._historyIndex];
      if (currentPath && currentPath.length === path.length && currentPath.every((id, idx) => sameNodeId(id, path[idx]))) {
        return;
      }

      // Check if we are navigating up to the parent of the current node
      if (currentPath && path.length === currentPath.length - 1 && path.every((id, idx) => sameNodeId(id, currentPath[idx]))) {
        // If the previous history entry is already the parent, just go back to it
        if (this._historyIndex > 0) {
          const prevPath = this._history[this._historyIndex - 1];
          if (prevPath && prevPath.length === path.length && prevPath.every((id, idx) => sameNodeId(id, path[idx]))) {
            this._historyIndex--;
            return;
          }
        }
        // Otherwise, insert the parent path right before the current child path
        this._history.splice(this._historyIndex, 0, path);
        // index remains pointing to the newly inserted parent, and child is forward!
        return;
      }
    }

    // Truncate future history if we were in the middle of standard navigation
    this._history = this._history.slice(0, this._historyIndex + 1);
    this._history.push(path);
    this._historyIndex = this._history.length - 1;
    if (this._history.length > 50) {
      this._history.shift();
      this._historyIndex--;
    }
  }

  private async _historyBack() {
    if (this._historyIndex > 0) {
      this._historyIndex--;
      await this._jumpToNode(this._history[this._historyIndex], true);
    }
  }

  private async _historyForward() {
    if (this._historyIndex < this._history.length - 1) {
      this._historyIndex++;
      await this._jumpToNode(this._history[this._historyIndex], true);
    }
  }

  private async _jumpToNode(nodeIdOrPath: NodeId | NodeId[], fromHistory = false) {
    this._isPushingToHistory = true;
    try {
      let path: NodeId[];
      let nodeId: NodeId;
      if (Array.isArray(nodeIdOrPath)) {
        path = nodeIdOrPath;
        nodeId = path[path.length - 1];
      } else {
        nodeId = nodeIdOrPath;
        path = await this.model.findPathToRoot(nodeId);
      }
      await this.tree.expandPath(path);
      if (!fromHistory) {
        this._pushToHistory(path);
      }
      await this.fill_attributesRegion(nodeId, path);
      await this.fill_referencesRegion(nodeId);
    } finally {
      this._isPushingToHistory = false;
    }
  }

  private _toggleAttributeReference() {
    if (this.attributeList.visible) {
      this.attributeList.hide();
      this.referenceList.show();
      this.referenceListHelp.show();
      this.referenceList.focus();
    } else {
      this.referenceList.hide();
      this.referenceListHelp.hide();
      this.attributeList.show();
      this.attributeList.focus();
    }
    this.screen.render();
  }
}
