import { NodeClass } from "node-opcua-client";
/**
 * @param options.class
 * @param options.nodeId
 * @param options.arrow
 * @constructor
 */
export class TreeItem {
    
    private arrow: string = "";
    private displayName: string = "";
    private class: NodeClass = 1;
    private valueAsString: string = "";

    constructor(options: any) {
        const self = this as any;
        Object.keys(options).forEach(function (k) {
            self[k] = options[k];
        });
    }


    get name(): string {
        let str = this.arrow + " " + this.displayName;
        if (this.class === NodeClass.Variable) {
            str += " = " + this.valueAsString;
        }
        return str;
    }
}
