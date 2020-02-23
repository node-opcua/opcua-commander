// exports.TreeOld = require("./lib/widget/TreeOld.js")

import * as _ from "underscore";
import { assert } from "node-opcua-client"
import chalk from "chalk";
import { Widgets } from "blessed";

const blessed = require("blessed");

// some unicode icon characters ►▼◊◌○●□▪▫֎☺◘♦

function toContent(node: any, isLastChild: boolean, parent: any): any {

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
    const c = node.expanded ? (hasChildren ? chalk.green("▼ ") : chalk.blue("▼ ")) : "► ";
    const str = node.prefix + s + c + node.name;

    return str;
}
function dummy(node: any, callback: (err: Error | null, child: any) => void) {
    callback(null, node.children);
}
export interface Tree extends Widgets.ListElement {

}

export class Tree extends blessed.List {

    private __data: any;
    private _index_selectedNode: number;
    private _old_selectedNode: any;

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

        this.key(["+", "right"], this.expandSelected.bind(this));
        this.key(["-", "left"], this.collapseSelected.bind(this));

        this._index_selectedNode = 0;
    }


    _add(node: any, isLastChild: boolean, parent: any) {
        node.isLastChild = isLastChild;
        const item = this.add(toContent(node, isLastChild, parent)) as any;
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

            if (_.isFunction(node.children)) {
                return;
            }
            node.children = node.children || [];
            let isLastChild;

            for (let i = 0; i < node.children.length; i++) {

                const child = node.children[i];
                if (child) {
                    child.depth = depth + 1;

                    isLastChild = (i === node.children.length - 1);
                    this._add(child, isLastChild, node);
                    if (child.expanded && !_.isFunction(child.children)) {
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

        const populate_children = _.isFunction(node.children) ? node.children : dummy;
        populate_children.call(this, node, (err: Error | null, children: any) => {
            if (err) {
                return;
            }
            assert(_.isArray(children));
            node.children = children;
            node.expanded = true;
            this.setData(this.__data);
        });
    }

    collapseSelected() {
        const node = this.getSelectedItem().node;
        if (!node.expanded) {
            return;
        }
        node.expanded = false;
        this.setData(this.__data);
    }

    setData(data: any) {
        this.__data = data;
        this.walk(data, 0);
        this.screen.render();
    }
    getSelectedItem() {
        return this.getTreeItemAtPos(this.getSelectedIndex());
    }
    private getTreeItemAtPos(selectedIndex: number) {
        return (this as any).items[selectedIndex];
    }
    private getSelectedIndex(): number {
        return (this as any).selected;
    }
}

