import {
    AttributeIds,
    OPCUAClient,
    ClientSession,
    ClientSubscription,
    MessageSecurityMode,
    SecurityPolicy,
    UserIdentityToken,
    UserIdentityInfo,
    UserTokenType,
    TimestampsToReturn,
    installAlarmMonitoring,
    ClientAlarmList,
    ClientMonitoredItem,
    NodeId,
    NodeClass,
    accessLevelFlagToString,
    DataTypeIds,
    DataValue,
    VariantArrayType,
    BrowseDirection,
    Variant
} from "node-opcua-client";
import chalk from "chalk";
import * as path from "path";
import { w } from "../utils/utils";
import { EventEmitter } from "events";
import { StatusCodes } from "node-opcua-status-code";
import _ from "underscore";

const attributeKeys = Object.keys(AttributeIds).filter((x) => x !== "Invalid" && x[0].match(/[0-9]/)).map((x) => parseInt(x, 10));

const data = {
    reconnectionCount: 0,
    tokenRenewalCount: 0,
    receivedBytes: 0,
    sentBytes: 0,
    sentChunks: 0,
    receivedChunks: 0,
    backoffCount: 0,
    transactionCount: 0,
};

export interface NodeChild {
    arrow: string,
    browseName: string,
    nodeId: NodeId,
    nodeClass: NodeClass
}

export function makeUserIdentity(argv: any): UserIdentityInfo {

    let userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous }; // anonymous

    if (argv.userName && argv.password) {
        userIdentity = {
            type: UserTokenType.UserName,
            userName: argv.userName,
            password: argv.password
        };

    } else if (argv.userCertificate && argv.userCertificatePrivateKey) {

        userIdentity = {
            type: UserTokenType.Certificate,
            certificateData: argv.userCertificate,
            privateKey: "todo"
        };

    }
    return userIdentity;
}

export interface Model {
    on(eventName: "alarmChanged", eventHandler: (list: ClientAlarmList) => void): this;
    on(eventName: "monitoredItemListUpdated", eventHandler: (monitoredItemsListData: any) => void): this;
    on(eventName: "monitoredItemChanged", eventHandler: (monitoredItemsListData: any, node: any, dataValue: DataValue) => void): this;
}
export class Model extends EventEmitter {

    private client?: OPCUAClient;
    private session?: ClientSession;
    private subscription?: ClientSubscription;
    private userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };
    public verbose: boolean = false;
    private endpointUrl: string = "";
    private monitoredItemsListData: any[] = [];
    private clientAlarms: ClientAlarmList = new ClientAlarmList();

    public data: any;
    public constructor() {
        super();
        this.data = data;
    }

    public async initialize(
        endpoint: string,
        securityMode: MessageSecurityMode,
        securityPolicy: SecurityPolicy,
        certificateFile: string,
        privateKeyFile: string
    ) {


        this.endpointUrl = this.endpointUrl;

        this.client = OPCUAClient.create({

            endpoint_must_exist: false,

            securityMode: securityMode,
            securityPolicy: securityPolicy,
            //xx serverCertificate: serverCertificate,
            defaultSecureTokenLifetime: 40000,
            certificateFile,
            privateKeyFile,

            keepSessionAlive: true

        });

        this.client.on("send_request", function () {
            data.transactionCount++;
        });

        this.client.on("send_chunk", function (chunk) {
            data.sentBytes += chunk.length;
            data.sentChunks++;
        });

        this.client.on("receive_chunk", function (chunk) {
            data.receivedBytes += chunk.length;
            data.receivedChunks++;
        });

        this.client.on("backoff", function (number, delay) {
            data.backoffCount += 1;
            console.log(chalk.yellow(`backoff  attempt #${number} retrying in ${delay / 1000.0} seconds`));
        });

        this.client.on("start_reconnection", () => {
            console.log(chalk.red(" !!!!!!!!!!!!!!!!!!!!!!!!  Starting reconnection !!!!!!!!!!!!!!!!!!! " + this.endpointUrl));
        });

        this.client.on("connection_reestablished", () => {
            console.log(chalk.red(" !!!!!!!!!!!!!!!!!!!!!!!!  CONNECTION RE-ESTABLISHED !!!!!!!!!!!!!!!!!!! " + this.endpointUrl));
            data.reconnectionCount++;
        });

        // monitoring des lifetimes
        this.client.on("lifetime_75", (token) => {
            if (this.verbose) {
                console.log(chalk.red("received lifetime_75 on " + this.endpointUrl));
            }
        });

        this.client.on("security_token_renewed", () => {
            data.tokenRenewalCount += 1;
            if (this.verbose) {
                console.log(chalk.green(" security_token_renewed on " + this.endpointUrl));
            }
        });
    }
    public async create_subscription() {

        if (!this.session) { throw new Error("Invalid Session") };
        const parameters = {
            requestedPublishingInterval: 500,
            requestedLifetimeCount: 1000,
            requestedMaxKeepAliveCount: 12,
            maxNotificationsPerPublish: 100,
            publishingEnabled: true,
            priority: 10
        };
        try {
            this.subscription = await this.session.createSubscription2(parameters);
            console.log("subscription created");
        }
        catch (err) {
            console.log("Cannot create subscription");
        }
    }

    public async doDonnect(endpointUrl: string, userIdentity: UserIdentityInfo) {

        this.userIdentity = userIdentity;
        console.log("connecting to ....", endpointUrl);
        try {
            await this.client!.connect(endpointUrl);
        } catch (err) {
            console.log(" Cannot connect", err.toString());
            console.log(chalk.red("  exiting"));
            setTimeout(function () {
                return process.exit(-1);
            }, 25000);
            return;
        }

        try {
            this.session = await this.client!.createSession(this.userIdentity);
        } catch (err) {
            console.log(" Cannot create session ", err.toString());
            console.log(chalk.red("  exiting"));
            setTimeout(function () {
                return process.exit(-1);
            }, 25000);
            return;
        }
        this.session.on("session_closed", () => {
            console.log(" Warning => Session closed");
        });
        this.session.on("keepalive", () => {
            console.log("session keepalive");
        });
        this.session.on("keepalive_failure", () => {
            console.log("session keepalive failure");
        });
        console.log("connected to ....", endpointUrl);
        await this.create_subscription();
    }

    public async disconnect(): Promise<void> {
        if (this.session) {
            const session = this.session;
            this.session = undefined;
            await session.close();
        }
        await this.client!.disconnect();
    }

    public request_write_item(treeItem: any) {
        if (!this.subscription) return;
        const node = treeItem.node;
        return treeItem;
    }

    private getAttributeValue(attributes: any[], attribute: number) {
        return attributes.find(a => a.attribute == attributeIdtoString[attribute])
    }
    public async writeNode(node: any, data: any) {
        const attributes = await this.readNodeAttributes(node);
        const dataType = this.getAttributeValue(attributes, AttributeIds.DataType);
        const arrayDimension = this.getAttributeValue(attributes, AttributeIds.ArrayDimensions);
        if (dataType) {
            const dataToWrite = new Variant()
            dataToWrite.dataType = dataType.text.split(" ")[0];
            dataToWrite.value = data;
            dataToWrite.arrayType = arrayDimension.text > 0 ?  VariantArrayType.Array : VariantArrayType.Scalar;
            let risultato = await this.session.writeSingleNode(node.nodeId, dataToWrite);
            return risultato;
        }

        return false;
    }

    public async readNode(node: any) {
        return await this.session.read(node);

    }
    public async readNodeValue(node: any) {
        if (!this.session) {
            return null;
        }
        
        const dataValues = await this.readNode(node);
        if (dataValues.statusCode == StatusCodes.Good) {
            if (dataValues.value.value) {
                switch (dataValues.value.arrayType) {
                    case VariantArrayType.Scalar:
                        return "" + dataValues.value.value;
                    case VariantArrayType.Array:
                        return dataValues.value.value.join(",");
                    default:
                        return "";
                }
            }
        }
        return null;
    }

    public monitor_item(treeItem: any) {

        if (!this.subscription) return;
        const node = treeItem.node;

        this.subscription.monitor({
            nodeId: node.nodeId,
            attributeId: AttributeIds.Value
            //, dataEncoding: { namespaceIndex: 0, name:null }
        }, {
            samplingInterval: 1000,
            discardOldest: true,
            queueSize: 100
        },
            TimestampsToReturn.Both,
            (err: Error | null, monitoredItem: ClientMonitoredItem) => {

                if (err) {
                    console.log("cannot create monitored item", err.message);
                    return;
                }

                node.monitoredItem = monitoredItem;

                const monitoredItemData = [node.browseName, node.nodeId.toString(), "Q"];

                this.monitoredItemsListData.push(monitoredItemData);

                this.emit("monitoredItemListUpdated", this.monitoredItemsListData);
                //   xxx                monitoredItemsList.setRows(monitoredItemsListData);

                monitoredItem.on("changed", (dataValue: DataValue) => {

                    console.log(" value ", node.browseName, node.nodeId.toString(), " changed to ", chalk.green(dataValue.value.toString()));
                    if (dataValue.value.value.toFixed) {
                        node.valueAsString = w(dataValue.value.value.toFixed(3), 16, " ");
                    } else {
                        node.valueAsString = w(dataValue.value.value.toString(), 16, " ");
                    }
                    monitoredItemData[2] = node.valueAsString;

                    this.emit("monitoredItemChanged", this.monitoredItemsListData, node, dataValue);
                });
            });

    }

    public unmonitor_item(treeItem: any) {

        const node = treeItem.node;

        // terminate subscription
        node.monitoredItem.terminate(() => {


            let index = -1;
            this.monitoredItemsListData.forEach((entry, i) => {
                if (entry[1] == node.nodeId.toString()) {
                    index = i;
                }
            });
            if (index > -1) {
                this.monitoredItemsListData.splice(index, 1);
            }

            node.monitoredItem = null;
            this.emit("monitoredItemListUpdated", this.monitoredItemsListData);
        });
    }


    public async installAlarmMonitoring() {
        if (!this.session) { return; }
        this.clientAlarms = await installAlarmMonitoring(this.session);
        this.clientAlarms.on("alarmChanged", () => {
            this.clientAlarms.purgeUnusedAlarms();
            this.emit("alarmChanged", this.clientAlarms)
        });
    }


    public async readNodeAttributes(node: { nodeId: NodeId }): Promise<any[]> {

        if (!this.session) {
            return [];
        }
        const nodesToRead = attributeKeys.map((attributeId: number) => ({
            nodeId: node.nodeId,
            attributeId: attributeId
        }));

        try {

            const dataValues = await this.session.read(nodesToRead);

            const results: any[] = [];

            for (let i = 0; i < nodesToRead.length; i++) {

                const nodeToRead = nodesToRead[i];
                const dataValue = dataValues[i];

                if (dataValue.statusCode !== StatusCodes.Good) {
                    continue;
                }
                const s = toString1(nodeToRead.attributeId, dataValue);
                results.push({
                    attribute: attributeIdtoString[nodeToRead.attributeId],
                    text: s
                });
            }
            return results;
        } catch (err) {
            return [];
        }
    }


    public async expand_opcua_node(node: any): Promise<NodeChild[]> {

        if (!this.session) {
            throw new Error("No Session yet");
        }
        if (this.session.isReconnecting) {
            throw new Error("Session is not available (reconnecting)");
        }

        const children: NodeChild[] = [];

        const nodesToBrowse = [{
            nodeId: node.nodeId,
            referenceTypeId: "Organizes",
            includeSubtypes: true,
            browseDirection: BrowseDirection.Forward,
            resultMask: 0x3f
        },
        {
            nodeId: node.nodeId,
            referenceTypeId: "Aggregates",
            includeSubtypes: true,
            browseDirection: BrowseDirection.Forward,
            resultMask: 0x3f

        },
        {
            nodeId: node.nodeId,
            referenceTypeId: "HasSubtype",
            includeSubtypes: true,
            browseDirection: BrowseDirection.Forward,
            resultMask: 0x3f
        },
        ];

        try {
            const results = await this.session.browse(nodesToBrowse);

            let result = results[0];

            if (result.references) {
                for (let i = 0; i < result.references.length; i++) {
                    const ref = result.references[i];
                    children.push({
                        arrow: "◊-o-> ",
                        browseName: ref.browseName.toString(),
                        nodeId: ref.nodeId,
                        nodeClass: ref.nodeClass as number,
                    });
                }
            }

            result = results[1];
            if (result.references) {
                for (let i = 0; i < result.references.length; i++) {
                    const ref = result.references[i];
                    children.push({
                        arrow: "+--> ",
                        browseName: ref.browseName.toString(),
                        nodeId: ref.nodeId,
                        nodeClass: ref.nodeClass as number,
                    });
                }
            }
            result = results[2];
            if (result.references) {
                for (let i = 0; i < result.references.length; i++) {
                    const ref = result.references[i];
                    children.push({
                        arrow: "§--|> ",
                        browseName: ref.browseName.toString(),
                        nodeId: ref.nodeId,
                        nodeClass: ref.nodeClass as number,
                    });
                }
            }

            return children;

        } catch (err) {
            return [];
        }
    }

}

const attributeIdtoString = _.invert(AttributeIds);
const DataTypeIdsToString = _.invert(DataTypeIds);


function dataValueToString(dataValue: DataValue) {
    if (!dataValue.value || dataValue.value.value === null) {
        return "<???> : " + dataValue.statusCode.toString();
    }
    switch (dataValue.value.arrayType) {
        case VariantArrayType.Scalar:
            return dataValue.toString();
        case VariantArrayType.Array:
            return dataValue.toString();
        default:
            return "";
    }
}



function toString1(attribute: AttributeIds, dataValue: DataValue | null) {

    if (!dataValue || !dataValue.value || !dataValue.value.hasOwnProperty("value")) {
        return "<null>";
    }
    switch (attribute) {
        case AttributeIds.DataType:
            return DataTypeIdsToString[dataValue.value.value.value] + " (" + dataValue.value.value.toString() + ")";
        case AttributeIds.NodeClass:
            return NodeClass[dataValue.value.value] + " (" + dataValue.value.value + ")";
        case AttributeIds.IsAbstract:
        case AttributeIds.Historizing:
        case AttributeIds.EventNotifier:
            return dataValue.value.value ? "true" : "false"
        case AttributeIds.WriteMask:
        case AttributeIds.UserWriteMask:
            return " (" + dataValue.value.value + ")";
        case AttributeIds.NodeId:
        case AttributeIds.BrowseName:
        case AttributeIds.DisplayName:
        case AttributeIds.Description:
        case AttributeIds.ValueRank:
        case AttributeIds.ArrayDimensions:
        case AttributeIds.Executable:
        case AttributeIds.UserExecutable:
        case AttributeIds.MinimumSamplingInterval:
            if (!dataValue.value.value) {
                return "null";
            }
            return dataValue.value.value.toString();
        case AttributeIds.UserAccessLevel:
        case AttributeIds.AccessLevel:
            if (!dataValue.value.value) {
                return "null";
            }
            return accessLevelFlagToString(dataValue.value.value) + " (" + dataValue.value.value + ")";
        default:
            return dataValueToString(dataValue);
    }
}

