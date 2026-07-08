import chalk from "chalk";
import { assert, NodeId, sameNodeId, NodeClass } from "node-opcua-client";
import blessed, { Widgets } from "blessed";
import { TreeItem } from "./tree_item.js";

// some unicode icon characters ►▼◊◌○●□▪▫֎☺◘♦

function isFunction(variableToCheck: any) {
    return variableToCheck instanceof Function;
}

const nsColors = [
    chalk.white,
    chalk.cyan,
    chalk.green,
    chalk.yellow,
    chalk.magenta,
    chalk.blue,
    chalk.red,
    chalk.cyanBright,
    chalk.greenBright,
    chalk.yellowBright,
    chalk.magentaBright,
    chalk.blueBright,
    chalk.redBright,
];

function toContent(node: any, isLastChild: boolean, parent: any, showNamespace: boolean): any {

    if (parent) {
        const sep = (parent.isLastChild) ? " " : "│";
        node.prefix = parent.prefix + sep;
    } else {
        node.prefix = " ";
    }

    const s = (isLastChild) ? "└" : "├";

    const level = node.depth;
    assert(level >= 0 && level < 100);

    const hasChildren = node.children && node.children.length > 0;
    //    [+]
    const c = node.expanded ? (hasChildren ? chalk.green("▼") : "─") : "►";
    
    let typeName = "";
    if (node.typeDefinitionName) {
        typeName = chalk.grey(" [" + node.typeDefinitionName + "]");
    }

    const ns = node.nodeId ? node.nodeId.namespace : 0;
    const color = nsColors[ns % nsColors.length];
    
    let nameWithNs = node.name;
    if (showNamespace && ns !== 0) {
        nameWithNs = "(" + ns + ") " + node.name;
    }
    nameWithNs = color(nameWithNs);

    const str = node.prefix + s + c + nameWithNs + typeName;

    return str;
}
function dummy(node: any, callback: (err: Error | null, child: any) => void) {
    callback(null, node.children);
}
export interface Tree extends Widgets.ListElement {

}
export class Tree extends (blessed as any).list {
    public filterPattern: string = "";
    private items: TreeItem[] = [];
    public __data: any;
    private _index_selectedNode: number;
    private _old_selectedNode: any;
    private showNamespace = false;

    constructor(options: any) {

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

        options.border = options.border || "line";
        options.scrollbar = options.scrollbar || scrollbar;
        options.style = options.style || style;
        options.keys = true;

        super(options);

        this.showNamespace = !!options.showNamespace;

        this.key(["+", "right"], this.expandSelected.bind(this));
        this.key(["-", "left"], this.collapseSelected.bind(this));

        this._index_selectedNode = 0;
    }


    _add(node: any, isLastChild: boolean, parent: any) {
        node.isLastChild = isLastChild;
        node.parent = parent;
        const item = this.add(toContent(node, isLastChild, parent, this.showNamespace)) as any;
        item.node = node;
        if (this._old_selectedNode === node) {
            this._index_selectedNode = this.itemCount - 1;
        }
    }

    get itemCount() { return (this as any).items.length; }

    walk(node: any, depth: number) {

        if (this.itemCount) {
            this._old_selectedNode = this.getSelectedItem().node;
            assert(this._old_selectedNode);
        }
        this._index_selectedNode = -1;
        this.setItems([]);

        if (node.name && depth === 0) {
            // root node
            node.depth = 0;
            this._add(node, true, null);
        }

        function dumpChildren(this: Tree, node: any, depth: number): void {

            if (isFunction(node.children)) {
                return;
            }
            node.children = node.children || [];
            let isLastChild;

            let childrenToWalk = node.children;

            for (let i = 0; i < childrenToWalk.length; i++) {

                const child = childrenToWalk[i];
                if (child) {
                    child.depth = depth + 1;

                    isLastChild = (i === childrenToWalk.length - 1);
                    this._add(child, isLastChild, node);
                    if (child.expanded && !isFunction(child.children)) {
                        dumpChildren.call(this, child, depth + 1);
                    }

                }
            }
        }

        if (node.expanded) {
            dumpChildren.call(this, node, depth);
        }
        this._index_selectedNode = this._index_selectedNode >= 0 ? this._index_selectedNode : 0;
        this.select(this._index_selectedNode);
    }


    expandSelected() {
        const node = this.getSelectedItem().node;
        if (node.expanded) {
            return;
        }

        const populate_children = isFunction(node.children) ? node.children : dummy;
        populate_children.call(this, node, (err: Error | null, children: any) => {
            if (err) {
                return;
            }
            assert(Array.isArray(children));
            node.children = children;
            node.expanded = true;
            this.setData(this.__data);
        });
    }

    collapseSelected() {
        const node = this.getSelectedItem().node;
        if (node.expanded) {
            node.expanded = false;
            this.setData(this.__data);
        } else if (node.parent) {
            const parentIndex = this.items.findIndex((item: any) => item.node === node.parent);
            if (parentIndex >= 0) {
                this.select(parentIndex);
                this.screen.render();
            }
        }
    }

    setData(data: any) {
        this.__data = data;
        this.walk(data, 0);
        this.screen.render();
    }
    getSelectedItem(): TreeItem {
        return this.getTreeItemAtPos(this.getSelectedIndex());
    }
    private getTreeItemAtPos(selectedIndex: number): TreeItem{
        return this.items[selectedIndex];
    }
    public getSelectedIndex(): number {
        return (this as any).selected;
    }
    async expandPath(nodeIds: NodeId[]): Promise<void> {
        let currentData = this.__data;
        for (let i = 0; i < nodeIds.length; i++) {
            const nodeId = nodeIds[i];
            if (!sameNodeId(currentData.nodeId, nodeId)) {
                // Find which child matches nodeId
                const child = currentData.children?.find((c: any) => sameNodeId(c.nodeId, nodeId));
                if (child) {
                    currentData = child;
                } else {
                    // Try to expand currentData if it has children function
                    if (isFunction(currentData.children)) {
                         await new Promise<void>((resolve, reject) => {
                             currentData.children.call(this, currentData, (err: Error | null, children: any) => {
                                 if (err) return reject(err);
                                 currentData.children = children;
                                 currentData.expanded = true;
                                 this.setData(this.__data);
                                 resolve();
                             });
                         });
                         const childAfter = currentData.children?.find((c: any) => sameNodeId(c.nodeId, nodeId));
                         if (childAfter) {
                             currentData = childAfter;
                         } else {
                             break;
                         }
                    } else {
                        break;
                    }
                }
            }
            
            if (i === nodeIds.length - 1) {
                // Found target!
                this.setData(this.__data); // Ensure everything is walked
                let index = (this as any).items.findIndex((item: any) => item && item.node === currentData);
                if (index < 0) {
                    index = (this as any).items.findIndex((item: any) => item && item.node && item.node.nodeId && sameNodeId(item.node.nodeId, nodeId));
                }
                if (index >= 0) {
                    this.select(index);
                    this.scrollTo(index);
                    if (typeof this.emit === "function") {
                        this.emit("select", this.items[index]);
                    }
                    if (this.screen) {
                        this.screen.render();
                    }
                }
                break;
            }

            if (!currentData.expanded) {
                 if (isFunction(currentData.children)) {
                      await new Promise<void>((resolve, reject) => {
                          currentData.children.call(this, currentData, (err: Error | null, children: any) => {
                              if (err) return reject(err);
                              currentData.children = children;
                              currentData.expanded = true;
                              this.setData(this.__data);
                              resolve();
                          });
                      });
                 } else {
                      currentData.expanded = true;
                      this.setData(this.__data);
                 }
            }
        }
    }
}

