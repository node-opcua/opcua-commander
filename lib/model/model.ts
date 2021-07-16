import * as blessed from "blessed";
import { format, callbackify } from "util";
import chalk from "chalk";

import { TreeItem } from "../widget/tree_item";
import { ClientAlarmList, resolveNodeId, DataValue, ResultMask, VariantArrayType } from "node-opcua-client";

import { Tree } from "../widget/widget_tree";
import { Model } from "../model/model";
import { updateAlarmBox } from "./alarm_box";
import { w } from "../utils/utils";
import { threadId } from "worker_threads";

const w2 = "40%";

const scrollbar = {
    ch: " ",
    track: {
        bg: "cyan"
    },
    style: {
        inverse: true
    }
};

const style = {

    focus: {
        border: {
            fg: "yellow"
        },
        bold: false

    },
    item: {
        hover: {
            bg: "blue"
        }
    },
    selected: {
        bg: "blue",
        bold: true
    }
};


let old_console_log: any;

export function makeItems(arr: any[], width: number): string[] {
    return arr.map((a) => {
        return w(a[0], 25, ".") + ": " + w(a[1], width, " ");
    });
}


let refreshTimer: NodeJS.Timeout | null = null;

export class View {
    private monitoredItemsList: any;
    private $headers: string[] = [];

    public screen: blessed.Widgets.Screen;
    public area1: blessed.Widgets.BoxElement;
    public area2: blessed.Widgets.BoxElement;
    public menuBar: blessed.Widgets.ListbarElement;
    public alarmBox?: blessed.Widgets.ListTableElement;
    public attributeList: blessed.Widgets.ListElement;
    public logWindow: blessed.Widgets.ListElement;
    public tree: Tree;
    public writeForm: blessed.Widgets.BoxElement;
    public valuesToWriteElement: blessed.Widgets.TextboxElement;


    public model: Model;

    constructor(model: Model) {

        this.model = model;

        // Create a screen object.
        this.screen = blessed.screen({
            smartCSR: true,
            autoPadding: false,
            fullUnicode: true,
            title: "OPCUA CLI-Client"
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
        this.install_monitoredItemsWindow();
        this.install_writeFormWindow();
        this.logWindow = this.install_logWindow();
        this.menuBar = this.install_mainMenu();
        this.tree = this.install_address_space_explorer();
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
            style: {...style},
            align: "left",
            hidden: true
        });

        {
            const form = blessed.form({
                parent: this.writeForm,
                width: "100%-2",
                height: "100%-2",
                top: 1,
                left: 1,
                keys: true
            });

            blessed.text({
                parent: form,
                top: 0,
                left: 0,
                content: 'VALUES (Comma separated for array):'
            });

            this.valuesToWriteElement = blessed.textbox({
                parent: form,
                name: 'valuesToWrite',
                top: 1,
                left: 0,
                height: "100%-2",
                inputOnFocus: true,
                mouse: false,
                vi: false,
                keys: false,
                content: '',
                border: {
                    type: 'line'
                },
                focus: {
                    fg: 'blue'
                }
            });

            const padding = {
                top: 0,
                right: 2,
                bottom: 0,
                left: 2
            };
            const buttonTop = "100%-1";
            var submit = blessed.button({
                parent: form,
                name: 'submit',
                content: 'Submit',
                top: buttonTop,
                left: 0,
                shrink: true,
                mouse: true,
                padding,
                style: {
                    bold: true,
                    fg: 'white',
                    bg: 'green',
                    focus: {
                        inverse: true
                    }
                }
            });
            submit.on('press', function () {
                form.submit();
            });


            var closeForm = blessed.button({
                parent: form,
                name: 'close',
                content: 'close',
                top: buttonTop,
                right: 0,
                shrink: true,
                mouse: true,
                padding,
                style: {
                    bold: true,
                    fg: 'white',
                    bg: 'red',
                    focus: {
                        inverse: true
                    }
                }
            });
            closeForm.on('press', () => {
                this.writeForm.hide();
                this.screen.render();
            });



            const writeResultMsg = blessed.text({
                parent: form,
                top: submit.top,
                left: "center",
                content: ''
            });


            form.on('submit',async (data: any) => {
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
                    console.log(res);
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
             style: {...style},
           align: "left"
        });
        this.area1.append(this.monitoredItemsList);


        // binding .....

        this.model.on("monitoredItemListUpdated", (monitoredItemsListData: any) => {
            if (monitoredItemsListData.length > 0) {
                this.monitoredItemsList.setRows(monitoredItemsListData);
            } else {
                // when using setRows with empty array, the view does not update.
                // setting an empty row.
                const empty = [
                    [" "]
                ];
                this.monitoredItemsList.setRows(empty);
            }
            this.monitoredItemsList.render();
        });

        this.model.on("monitoredItemChanged", this._onMonitoredItemChanged.bind(this));

    }
    private _onMonitoredItemChanged(monitoredItemsListData: any, /*node: any, dataValue: DataValue*/) {

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
            height: "100%-4",
            keys: true,
            border: "line",
            scrollable: true,
            scrollbar: {
                ch: " ",
                track: {
                    bg: "cyan"
                },
                style: {
                    inverse: true
                }
            },
            style: {...style}
        });

        old_console_log = console.log;

        console.log = function (...args: [any]) {

            const str = format.apply(null, args);
            const lines = str.split("\n");
            lines.forEach((str: string) => {
                logWindow.addItem(str);
            });
            logWindow.select((logWindow as any).items.length - 1);

        };
        this.area2.append(logWindow);
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
            style: {...style},
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
            "Monitor":
            {
                //xx prefix: "M",
                keys: ["m"],
                callback: () => this._onMonitoredSelectedItem()
            },
            "Write":
            {
                keys: ["w"],
                callback: () => this._onWriteSelectedItem()
            },
            "Exit": {
                keys: ["q"], //["C-c", "escape"],
                callback: () => this._onExit()
            },
            "Tree": {
                keys: ["t"],
                callback: () => this.tree.focus()
            },
            "Attributes": {
                keys: ["l"],
                callback: () => this.attributeList.focus()
            },
            "Info": {
                keys: ["i"],
                callback: () => this.logWindow.focus()
            },
            "Clear": {
                keys: ["c"],
                callback: () => {
                    this.logWindow.clearItems();
                    this.logWindow.screen.render();
                }
            },
            "Unmonitor": {
                keys: ["u"],
                callback: () => this._onUnmonitoredSelectedItem()
            },
            "Stat": {
                keys: ["s"],
                callback: () => this._onDumpStatistics()
            },
            "Alarm": {
                keys: ["a"],
                callback: this._onToggleAlarmWindows.bind(this)
            },
            //  "Menu": { keys: ["A-a", "x"], callback: () => this.menuBar.focus() }
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
            style: {...style}
        });

        //allow control the table with the keyboard
        this.tree.on("select", (treeItem: any) => {
            if (treeItem) {
                this.fill_attributesRegion(treeItem.node);
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
                        this.fill_attributesRegion(treeItem.node);
                    }
                    refreshTimer = null;
                }, 100);
            }

        });

        this.area1.append(this.tree);

        this.populateTree();
        this.tree.focus();
        return this.tree;
    }

    private populateTree() {
        this.tree.setData({
            name: "RootFolder",
            nodeId: resolveNodeId("RootFolder"),
            children: this.expand_opcua_node.bind(this)
        });
    };

    private expand_opcua_node(node: any, callback: () => void) {

        async function f(this: any, node: any) {
            try {
                const children = await this.model.expand_opcua_node(node);
                const results = children.map((c: any) => (
                    new TreeItem({ ...c, children: this.expand_opcua_node.bind(this) })
                ));
                return results;
            } catch (err) {
                throw new Error("cannot expand");
            }
        }
        callbackify(f).call(this, node, callback);
    }

    private async fill_attributesRegion(node: any) {

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

        const attributes = await this.model.readNodeAttributes(node);
        if (attributes.length === 0) {
            return;
        }
        for (const r of attributes) {
            append_text(r.attribute, r.text, attr);
        }
        const width = (this.attributeList as any).width - 28;
        this.attributeList.setItems(makeItems(attr, width) as any);
        this.attributeList.screen.render();
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
            style: {...style},
            align: "left",
            keys: true
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
            style: {...style}
        });

        this.$headers = ["EventType", "ConditionId",
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
        this.model.on("alarmChanged", (list: ClientAlarmList) => updateAlarmBox(list, this.alarmBox, this.$headers));
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

    private _onMonitoredSelectedItem() {
        const treeItem = this.tree.getSelectedItem();
        if (treeItem.node.monitoredItem) {
            console.log(" Already monitoring ", treeItem.node.nodeId.toString());
            return;
        }
        this.model.monitor_item(treeItem);
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
    private _onDumpStatistics() {
        console.log("----------------------------------------------------------------------------");
        console.log(chalk.green("     transaction count : ", chalk.yellow(this.model.data.transactionCount)));
        console.log(chalk.green("            sent bytes : ", chalk.yellow(this.model.data.sentBytes)));
        console.log(chalk.green("        received bytes : ", chalk.yellow(this.model.data.receivedBytes)));
        console.log(chalk.green("   token renewal count : ", chalk.yellow(this.model.data.tokenRenewalCount)));
        console.log(chalk.green("    reconnection count : ", chalk.yellow(this.model.data.reconnectionCount)));
    }
};

