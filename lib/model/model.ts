import { EventEmitter } from "events";
import os from "os";
import fs from "fs";
import { exploreCertificate, certificateMatchesPrivateKey, readPrivateKey, readCertificate } from "node-opcua-crypto";

import chalk from "chalk";
const {
  bgBlueBright,
  yellow,
  cyanBright,
  greenBright, 
  magenta, bgCyanBright, cyan, bgGreenBright, bgWhiteBright, yellowBright, green, magentaBright, red
} = chalk;
import {
  accessLevelFlagToString,
  AttributeIds,
  browseAll,
  BrowseDirection,
  ClientAlarmList,
  ClientMonitoredItem,
  ClientSession,
  ClientSubscription,
  DataType,
  DataTypeIds,
  DataValue,
  ExpandedNodeId,
  installAlarmMonitoring,
  MessageSecurityMode,
  MonitoringMode,
  NodeClass,
  NodeId,
  OPCUAClient,
  ReadValueIdOptions,
  ReferenceDescription,
  resolveNodeId,
  sameNodeId,
  SecurityPolicy,
  TimestampsToReturn,
  UserIdentityInfo,
  UserTokenType,
  Variant,
  VariantArrayType,
  WriteValue,
} from "node-opcua-client";
import { OPCUACertificateManager } from "node-opcua-certificate-manager";
import { StatusCodes } from "node-opcua-status-code";
import { findBasicDataType } from "node-opcua-pseudo-session";
import { getStandardDataTypeFactory } from "node-opcua-factory";

import { w } from "../utils/utils.js";
import { extractBrowsePath } from "../utils/extract_browse_path.js";
import { TreeItem } from "../widget/tree_item.js";

const attributeKeys: string[] = [];
for (let i = 1; i <= AttributeIds.AccessLevelEx - 1; i++) {
  attributeKeys.push(AttributeIds[i]);
}

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
  arrow: string;
  displayName: string;
  nodeId: NodeId;
  nodeClass: NodeClass;
  typeDefinition?: ExpandedNodeId;
  typeDefinitionName?: string;
}

export function makeUserIdentity(argv: any): UserIdentityInfo {
  let userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous }; // anonymous

  if (argv.userName && argv.password) {
    userIdentity = {
      type: UserTokenType.UserName,
      userName: argv.userName,
      password: argv.password,
    };
  } else if (argv.userCertificate && argv.userCertificatePrivateKey) {
    if (!fs.existsSync(argv.userCertificate)) {
      throw new Error("Cannot find user certificate file: " + argv.userCertificate);
    }
    if (!fs.existsSync(argv.userCertificatePrivateKey)) {
      throw new Error("Cannot find user certificate private key file: " + argv.userCertificatePrivateKey);
    }
    const certificateData = readCertificate(argv.userCertificate);
    const privateKeyPEM = fs.readFileSync(argv.userCertificatePrivateKey, "utf-8");
    const privateKey = readPrivateKey(argv.userCertificatePrivateKey);

    // verify certificate and private key
    if (!certificateMatchesPrivateKey(certificateData, privateKey)) {
      throw new Error("User certificate and private key do not match!");
    }

    const certInfo = exploreCertificate(certificateData);
    const formatX500Name = (name: any) => Object.entries(name).map(([k, v]) => `${k}=${v}`).join(", ");
    console.log(cyan("Using User Certificate:"));
    console.log(cyan("  subject:  "), green(formatX500Name(certInfo.tbsCertificate.subject)));
    console.log(cyan("  issuer:   "), green(formatX500Name(certInfo.tbsCertificate.issuer)));
    console.log(cyan("  validity: "), green(certInfo.tbsCertificate.validity.notBefore.toISOString() + " - " + certInfo.tbsCertificate.validity.notAfter.toISOString()));

    userIdentity = {
      type: UserTokenType.Certificate,
      certificateData,
      privateKey: privateKeyPEM,
    };
  }
  return userIdentity;
}

export interface Model {
  on(eventName: "connectionError", eventHandler: (err: Error) => void): this;
  on(eventName: "alarmChanged", eventHandler: (list: ClientAlarmList) => void): this;
  on(eventName: "monitoredItemListUpdated", eventHandler: (monitoredItemsListData: any) => void): this;
  on(eventName: "monitoredItemChanged", eventHandler: (monitoredItemsListData: any, node: any, dataValue: DataValue) => void): this;
  on(eventName: "nodeChanged", eventHandler: (nodeId: NodeId) => void): this;
}

const hasComponentNodeId = resolveNodeId("HasComponent").toString();
const hasPropertyNodeId = resolveNodeId("HasProperty").toString();
const hasSubTypeNodeId = resolveNodeId("HasSubtype").toString();
const organizesNodeId = resolveNodeId("Organizes").toString();
function referenceToSymbol(ref: ReferenceDescription) {
  // "+-->" // aggregate
  switch (ref.referenceTypeId.toString()) {
    case organizesNodeId:
      return "─o──";
    case hasComponentNodeId:
      return "──┼";
    case hasPropertyNodeId:
      return "──╫";
    case hasSubTypeNodeId:
      return "───▷";
    default:
      return "-->";
  }
}
function symbol(ref: ReferenceDescription) {
  const s = " ";
  if (ref.typeDefinition.toString() === "ns=0;i=61") {
    return [yellow("[F]"), yellow("[F]")]; // ["🗀", "🗁"]; // "📁⧇Ⓞ"
  }
  switch (ref.nodeClass) {
    case NodeClass.Object:
      return [cyanBright("[O]"), cyanBright("[O]")];
    case NodeClass.Variable:
      return [greenBright("[V]"), greenBright("[V]")];
    case NodeClass.Method:
      return [magenta("[M]"), magenta("[M]")];
    case NodeClass.ObjectType:
      return [bgCyanBright("[O]"), cyan("[OT]")];
    case NodeClass.VariableType:
      return [bgGreenBright("[V]"), yellow("Ⓥ")];
    case NodeClass.ReferenceType:
      return [bgWhiteBright.black("[R]"), yellowBright("➾")];
    case NodeClass.DataType:
      return [bgBlueBright("[D]"), bgBlueBright("Ⓓ")];
    case NodeClass.View:
      return [magentaBright("[V]"), magentaBright("Ⓓ")];
  }
  return s;
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
  private enumDefinitionCache: Map<string, Map<number, string> | null> = new Map();
  private typeNameCache: Map<string, string> = new Map();
  private multiStateCache: Map<string, string[]> = new Map();

  public data: any;
  public showNamespace = false;
  public subtypeMode = false;
  public constructor() {
    super();
    this.data = data;
  }

  public clearCache() {
    this.enumDefinitionCache.clear();
    this.typeNameCache.clear();
    this.multiStateCache.clear();
  }

  public async initialize(
    endpoint: string,
    securityMode: MessageSecurityMode,
    securityPolicy: SecurityPolicy,
    certificateFile: string,
    clientCertificateManager: OPCUACertificateManager,
    applicationName: string,
    applicationUri: string
  ) {
    this.endpointUrl = this.endpointUrl;

    this.client = OPCUAClient.create({
      endpointMustExist: false,

      securityMode,
      securityPolicy,

      defaultSecureTokenLifetime: 40000, // 40 seconds

      certificateFile,

      clientCertificateManager,

      applicationName,
      applicationUri,

      clientName: "Opcua-Commander-" + os.hostname(),
      keepSessionAlive: true,
    });

    (this.client as any).on("send_request", function () {
      data.transactionCount++;
    });

    (this.client as any).on("send_chunk", function (chunk: any) {
      data.sentBytes += chunk.length;
      data.sentChunks++;
    });

    (this.client as any).on("receive_chunk", function (chunk: any) {
      data.receivedBytes += chunk.length;
      data.receivedChunks++;
    });

    (this.client as any).on("backoff", function (number: any, delay: any) {
      data.backoffCount += 1;
      console.log(yellow(`backoff  attempt #${number} retrying in ${delay / 1000.0} seconds`));
    });

    (this.client as any).on("start_reconnection", () => {
      console.log(red(" !!!!!!!!!!!!!!!!!!!!!!!!  Starting reconnection !!!!!!!!!!!!!!!!!!! " + this.endpointUrl));
      this.clearCache();
    });

    (this.client as any).on("connection_reestablished", () => {
      console.log(red(" !!!!!!!!!!!!!!!!!!!!!!!!  CONNECTION RE-ESTABLISHED !!!!!!!!!!!!!!!!!!! " + this.endpointUrl));
      data.reconnectionCount++;
    });

    // monitoring des lifetimes
    (this.client as any).on("lifetime_75", (token: any) => {
      if (this.verbose) {
        console.log(red("received lifetime_75 on " + this.endpointUrl));
      }
    });

    (this.client as any).on("security_token_renewed", () => {
      data.tokenRenewalCount += 1;
      if (this.verbose) {
        console.log(green(" security_token_renewed on " + this.endpointUrl));
      }
    });
  }
  public async create_subscription() {
    if (!this.session) {
      throw new Error("Invalid Session");
    }
    const parameters = {
      requestedPublishingInterval: 500,
      requestedLifetimeCount: 1000,
      requestedMaxKeepAliveCount: 12,
      maxNotificationsPerPublish: 100,
      publishingEnabled: true,
      priority: 10,
    };
    try {
      this.subscription = await this.session.createSubscription2(parameters);
      console.log("subscription created");
    } catch (err) {
      console.log("Cannot create subscription");
    }
  }

  public async doConnect(endpointUrl: string, userIdentity: UserIdentityInfo) {
    this.userIdentity = userIdentity;
    console.log("connecting to ....", endpointUrl);
    try {
      await this.client!.connect(endpointUrl);
    } catch (err: any) {
      console.log(" Cannot connect", err.toString());
      if (this.client!.securityMode !== MessageSecurityMode.None && err.message.match(/has been disconnected by third party/)) {
        console.log(
          "Because you are using a secure connection, you need to make sure that the certificate\n" +
          "of opcua-commander is trusted by the server you're trying to connect to.\n" +
          "Please see the documentation for instructions on how to import a certificate into the CA store of the server.\n" +
          `The opcua-commander certificate is in the folder \n${cyan(this.client!.certificateFile!)}`
        );
      }
      this.emit("connectionError", err);
      return;
    }

    try {
      this.session = await this.client!.createSession(this.userIdentity);
    } catch (err: any) {
      console.log(" Cannot create session ", err.toString());
      console.log(red("  exiting"));
      setTimeout(function () {
        return process.exit(-1);
      }, 25000);
      return;
    }
    this.session.on("session_closed", () => {
      console.log(" Warning => Session closed");
      this.clearCache();
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

  public async writeNode(node: { nodeId: NodeId }, data: any) {
    if (!this.session) return StatusCodes.BadSessionIdInvalid;
    const dataTypeIdDataValue = await this.session.read({ nodeId: node.nodeId, attributeId: AttributeIds.DataType });
    const arrayDimensionDataValue = await this.session.read({ nodeId: node.nodeId, attributeId: AttributeIds.ArrayDimensions });
    const valueRankDataValue = await this.session.read({ nodeId: node.nodeId, attributeId: AttributeIds.ValueRank });

    const dataTypeId = dataTypeIdDataValue.value?.value as NodeId;
    if (!dataTypeId) return StatusCodes.BadDataTypeIdUnknown;
    const dataType = await findBasicDataType(this.session as any, dataTypeId);

    const arrayDimension = arrayDimensionDataValue.value?.value as null | number[];
    const valueRank = valueRankDataValue.value?.value as number;

    const coerceBoolean = (data: any) => {
      return data === "true" || data === "1" || data === true;
    };
    const coerceNumber = (data: any) => {
      return parseInt(data, 10);
    };
    const coerceNumberR = (data: any) => {
      return parseFloat(data);
    };

    const coerceNoop = (data: any) => data;

    const coerceFunc = (dataType: DataType) => {
      switch (dataType) {
        case DataType.Boolean:
          return coerceBoolean;
        case DataType.Int16:
        case DataType.Int32:
        case DataType.Int64:
        case DataType.UInt16:
        case DataType.UInt32:
        case DataType.UInt64:
          return coerceNumber;
        case DataType.Double:
        case DataType.Float:
          return coerceNumberR;
        default:
          return coerceNoop;
      }
    };


    if (dataType) {
      try {
        const arrayType =
          valueRank === -1 ? VariantArrayType.Scalar : valueRank === 1 ? VariantArrayType.Array : VariantArrayType.Matrix;
        const dimensions = arrayType === VariantArrayType.Matrix ? arrayDimension : undefined;

        function coerceStringToDataType(data: any) {
          const c = coerceFunc(dataType);
          if (arrayType === VariantArrayType.Scalar) {
            return c(data);
          } else {
            return data.map((d: any) => c(d));
          }
        }
        const value = new Variant({
          dataType,
          arrayType,
          dimensions,
          value: coerceStringToDataType(data),
        });
        const writeValue = new WriteValue({
          nodeId: node.nodeId,
          attributeId: AttributeIds.Value,
          value: {
            value,
          },
        });
        let statusCode = await this.session.write(writeValue);
        console.log("writing    ", writeValue.toString());
        console.log("statusCode ", statusCode.toString());
        this.emit("nodeChanged", node.nodeId);
        return statusCode;
      } catch (err) {
        return StatusCodes.BadInternalError;
      }
    }

    return false;
  }

  public async extractBrowsePath(nodeId: NodeId): Promise<string> {
    return await extractBrowsePath(this.session!, nodeId);
  }
  public async readNode(node: any) {
    return await this.session!.read(node);
  }
  public async readNodeValue(node: any) {
    if (!this.session) {
      return null;
    }

    const dataValues = await this.readNode(node);
    if (dataValues.statusCode == StatusCodes.Good) {
      if (dataValues.value?.value) {
        switch (dataValues.value.arrayType) {
          case VariantArrayType.Scalar:
            return "" + dataValues.value.value;
          case VariantArrayType.Array:
            return (dataValues.value.value as any[]).join(",");
          default:
            return "";
        }
      }
    }
    return null;
  }

  public async monitor_item(treeItem: TreeItem) {
    if (!this.subscription || !this.session) return;
    const node = treeItem.node;

    // Fetch DataType if not already present on the node
    if (!node.dataTypeNodeId) {
      try {
        const dataValue = await this.session.read({
          nodeId: node.nodeId,
          attributeId: AttributeIds.DataType
        });
        if (dataValue.statusCode === StatusCodes.Good) {
          node.dataTypeNodeId = dataValue.value.value;
        }
      } catch (err) {
        // ignore
      }
    }

    this.subscription.monitor(
      {
        nodeId: node.nodeId,
        attributeId: AttributeIds.Value,
        //, dataEncoding: { namespaceIndex: 0, name:null }
      },
      {
        samplingInterval: 1000,
        discardOldest: true,
        queueSize: 100,
      },
      TimestampsToReturn.Both,
      MonitoringMode.Reporting,
      (err: Error | null, monitoredItem?: ClientMonitoredItem) => {
        if (err || !monitoredItem) {
          console.log("cannot create monitored item", err ? err.message : "unknown error");
          return;
        }

        node.monitoredItem = monitoredItem;

        const monitoredItemData = [node.displayName, node.nodeId.toString(), "Q"];

        this.monitoredItemsListData.push(monitoredItemData);

        this.emit("monitoredItemListUpdated", this.monitoredItemsListData);
        //   xxx                monitoredItemsList.setRows(monitoredItemsListData);

        monitoredItem.on("changed", async (dataValue: DataValue) => {
          console.log(" value ", node.browseName, node.nodeId.toString(), " changed to ", green(dataValue.value.toString()));
          
          let enumStr: string | null = null;
          if (node.dataTypeNodeId && dataValue.value && typeof dataValue.value.value === "number") {
             enumStr = await this.getEnumerationMaybe(node.dataTypeNodeId, dataValue.value.value);
          }

          if (enumStr) {
             node.valueAsString = w(enumStr, 16, " ");
          } else if (dataValue.value && dataValue.value.value !== null && dataValue.value.value.toFixed && typeof dataValue.value.value === "number") {
            node.valueAsString = w(dataValue.value.value.toFixed(3), 16, " ");
          } else {
            node.valueAsString = w(dataValue.value ? dataValue.value.value.toString() : "null", 16, " ");
          }
          monitoredItemData[2] = node.valueAsString;

          this.emit("monitoredItemChanged", this.monitoredItemsListData, node, dataValue);
        });
      }
    );
  }

  public unmonitor_item(treeItem: TreeItem) {
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
    if (!this.session) {
      return;
    }
    this.clientAlarms = await installAlarmMonitoring(this.session);
    this.clientAlarms.on("alarmChanged", () => {
      this.clientAlarms.purgeUnusedAlarms();
      this.emit("alarmChanged", this.clientAlarms);
    });
  }

  /**
   * Attempts to resolve a numeric value to its enumeration string.
   * Checks if the DataType NodeId is a subtype of Enumeration by:
   * 1. Fast path: looking up standard enumerations in the factory
   * 2. Server path: browsing the DataType node for EnumStrings or EnumValues properties
   */
  public async getEnumerationMaybe(
    dataTypeNodeId: NodeId,
    value: number
  ): Promise<string | null> {
    const key = dataTypeNodeId.toString();

    // 1. Check Cache first
    if (this.enumDefinitionCache.has(key)) {
      const map = this.enumDefinitionCache.get(key);
      if (map) {
        return map.get(value) ?? null;
      }
      // if map is null, it means we already tried and it's not an enum or failed
      return null;
    }

    // 2. Fast path: check standard factory for known enumerations (ns=0)
    if (dataTypeNodeId.namespace === 0) {
      const enumName = DataTypeIdsToString[dataTypeNodeId.value.toString()];
      if (enumName) {
        const factory = getStandardDataTypeFactory();
        if (factory.hasEnumeration(enumName)) {
          const enumeration = factory.getEnumeration(enumName);
          if (enumeration) {
            const item = enumeration.typedEnum.get(value);
            if (item) return item.key;
          }
        }
      }
    }

    // 3. Server path: browse the DataType node for EnumStrings or EnumValues
    if (!this.session) return null;

    try {
      const browseResult = await this.session.browse({
        nodeId: dataTypeNodeId,
        referenceTypeId: "HasProperty",
        includeSubtypes: true,
        browseDirection: BrowseDirection.Forward,
        resultMask: 0x3f,
      });

      if (!browseResult.references || browseResult.references.length === 0) {
        this.enumDefinitionCache.set(key, null);
        return null;
      }

      let enumMap: Map<number, string> | null = null;

      for (const ref of browseResult.references) {
        const name = ref.browseName.name;

        if (name === "EnumStrings") {
          // EnumStrings: array of LocalizedText indexed by enum value
          const dv = await this.session!.read({
            nodeId: ref.nodeId,
            attributeId: AttributeIds.Value,
          });
          if (dv.value?.value && Array.isArray(dv.value.value)) {
            enumMap = new Map();
            const strings = dv.value.value;
            for (let i = 0; i < strings.length; i++) {
              const lt = strings[i];
              enumMap.set(i, lt.text ?? lt.toString());
            }
            break;
          }
        }

        if (name === "EnumValues") {
          // EnumValues: array of EnumValueType { value: Int64, displayName: LocalizedText }
          const dv = await this.session!.read({
            nodeId: ref.nodeId,
            attributeId: AttributeIds.Value,
          });
          if (dv.value?.value && Array.isArray(dv.value.value)) {
            enumMap = new Map();
            for (const ev of dv.value.value) {
              const evValue = Array.isArray(ev.value) ? ev.value[1] : ev.value;
              enumMap.set(Number(evValue), ev.displayName?.text ?? ev.displayName?.toString());
            }
            break;
          }
        }
      }

      this.enumDefinitionCache.set(key, enumMap);
      if (enumMap) {
        return enumMap.get(value) ?? null;
      }

    } catch (err) {
      // ignore
    }

    return null;
  }


  public async browseReferences(nodeId: NodeId): Promise<ReferenceDescription[]> {
    if (!this.session) return [];
    try {
      const results = await this.session!.browse({
        nodeId,
        browseDirection: BrowseDirection.Both,
        includeSubtypes: true,
        resultMask: 63,
      });
      return results.references || [];
    } catch (err) {
      console.log(err);
      return [];
    }
  }

  public async findPathToRoot(nodeId: NodeId): Promise<NodeId[]> {
    if (!this.session) return [];
    const path = [nodeId];
    let current = nodeId;
    const rootFolderId = resolveNodeId("RootFolder");
    try {
      while (!sameNodeId(current, rootFolderId)) {
        const results = await this.session!.browse({
          nodeId: current,
          referenceTypeId: "HierarchicalReferences",
          browseDirection: BrowseDirection.Inverse,
          includeSubtypes: true,
          resultMask: 63,
        });
        if (!results.references || results.references.length === 0) break;
        // Pick the first hierarchical parent
        current = NodeId.resolveNodeId(results.references[0].nodeId);
        path.unshift(current);
        if (path.length > 20) break; // Safety break
      }
    } catch (err) {
      console.log(err);
    }
    return path;
  }

  public async getBrowseNameMaybe(nodeId: NodeId): Promise<string> {
    const key = nodeId.toString();
    if (this.typeNameCache.has(key)) {
      return this.typeNameCache.get(key)!;
    }
    if (!this.session) return key;
    try {
      const dv = await this.session.read({
        nodeId,
        attributeId: AttributeIds.BrowseName,
      });
      if (dv.statusCode === StatusCodes.Good) {
        const name = dv.value.value.name || dv.value.value.toString();
        this.typeNameCache.set(key, name);
        return name;
      }
    } catch (err) {
      // ignore
    }
    return key;
  }

  private async getMultiStateStringMaybe(nodeId: NodeId, value: number): Promise<string | null> {
    const cacheKey = nodeId.toString();
    if (this.multiStateCache.has(cacheKey)) {
      const strings = this.multiStateCache.get(cacheKey)!;
      return strings[value] || null;
    }

    try {
      // Browse for EnumStrings property
      const browseResult = await this.session!.browse({
        nodeId,
        referenceTypeId: "HasProperty",
        browseDirection: BrowseDirection.Forward,
        resultMask: 63,
      });

      const enumStringsRef = browseResult.references?.find((r) => r.browseName.name === "EnumStrings");
      if (enumStringsRef) {
        const enumStringsValue = await this.session!.read({
          nodeId: enumStringsRef.nodeId,
          attributeId: AttributeIds.Value,
        });

        if (enumStringsValue.statusCode === StatusCodes.Good && Array.isArray(enumStringsValue.value.value)) {
          const enumStrings = enumStringsValue.value.value.map((v: any) => v.text || v.toString());
          this.multiStateCache.set(cacheKey, enumStrings);
          return enumStrings[value] || null;
        }
      }
    } catch (err) {
      // ignore
    }
    return null;
  }

  public async readNodeAttributes(nodeId: NodeId): Promise<{ attribute: string; text: string }[]> {
    if (!this.session) {
      return [];
    }
    const nodesToRead: ReadValueIdOptions[] = attributeKeys.map((attributeIdName: string) => ({
      nodeId,
      attributeId: ((AttributeIds as any)[attributeIdName as any]) as AttributeIds,
    }));

    try {

      const dataValues = await this.session!.read(nodesToRead);
      const results: { attribute: string, text: string }[] = [];

      let dataTypeNodeId: NodeId | null = null;
      const dataTypeIdx = nodesToRead.findIndex(n => n.attributeId === AttributeIds.DataType);
      if (dataTypeIdx >= 0 && dataValues[dataTypeIdx].statusCode === StatusCodes.Good) {
        dataTypeNodeId = dataValues[dataTypeIdx].value.value;
      }

      // Pre-resolve enumeration string for the Value attribute
      let resolvedEnumString: string | null = null;
      if (dataTypeNodeId) {
        const valueAttrIdx = nodesToRead.findIndex(n => n.attributeId === AttributeIds.Value);
        if (valueAttrIdx >= 0 && dataValues[valueAttrIdx].statusCode === StatusCodes.Good) {
          const v = dataValues[valueAttrIdx].value?.value;
          if (typeof v === "number") {
            resolvedEnumString = await this.getEnumerationMaybe(dataTypeNodeId, v);
            if (!resolvedEnumString) {
              resolvedEnumString = await this.getMultiStateStringMaybe(nodeId, v);
            }
          }
        }
      }

      for (let i = 0; i < nodesToRead.length; i++) {
        const nodeToRead = nodesToRead[i];
        const dataValue = dataValues[i];

        if (dataValue.statusCode !== StatusCodes.Good && nodeToRead.attributeId !== AttributeIds.Value) {
          continue;
        }

        if (nodeToRead.attributeId === AttributeIds.Value) {
          // Push separate entries for a better UX
          results.push({
            attribute: "Value",
            text: dataValueValueToString(dataValue, resolvedEnumString)
          });
          results.push({
            attribute: "StatusCode",
            text: dataValue.statusCode ? dataValue.statusCode.toString() : "Good"
          });
          if (dataValue.sourceTimestamp && dataValue.sourceTimestamp.getTime() !== 0) {
            let src = dataValue.sourceTimestamp.toISOString();
            if (dataValue.sourcePicoseconds !== undefined && dataValue.sourcePicoseconds !== 0) {
              src += " ns:" + dataValue.sourcePicoseconds;
            }
            results.push({ attribute: "SourceTimestamp", text: src });
          }
          if (dataValue.serverTimestamp && dataValue.serverTimestamp.getTime() !== 0) {
            let srv = dataValue.serverTimestamp.toISOString();
            if (dataValue.serverPicoseconds !== undefined && dataValue.serverPicoseconds !== 0) {
              srv += " ns:" + dataValue.serverPicoseconds;
            }
            results.push({ attribute: "ServerTimestamp", text: srv });
          }
        } else {
          const s = toString1(nodeToRead.attributeId!, dataValue, dataTypeNodeId, null);
          results.push({
            attribute: attributeIdToString[nodeToRead.attributeId!],
            text: s,
          });
        }
      }
      return results;
    } catch (err) {
      console.log(err);
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

    let nodesToBrowse;
    if (this.subtypeMode) {
        nodesToBrowse = [
            {
                nodeId: node.nodeId,
                referenceTypeId: "HasSubtype",
                includeSubtypes: true,
                browseDirection: BrowseDirection.Forward,
                resultMask: 0x3f,
            }
        ];
    } else {
        nodesToBrowse = [
            {
                nodeId: node.nodeId,
                referenceTypeId: "Organizes",
                includeSubtypes: true,
                browseDirection: BrowseDirection.Forward,
                resultMask: 0x3f,
            },
            {
                nodeId: node.nodeId,
                referenceTypeId: "Aggregates",
                includeSubtypes: true,
                browseDirection: BrowseDirection.Forward,
                resultMask: 0x3f,
            },
            {
                nodeId: node.nodeId,
                referenceTypeId: "HasSubtype",
                includeSubtypes: true,
                browseDirection: BrowseDirection.Forward,
                resultMask: 0x3f,
            },
        ];
    }

    try {
      const results = await browseAll(this.session, nodesToBrowse);

      const seenNodes: Set<string> = new Set();
      for (const result of results) {
        if (result.references) {
          for (const ref of result.references) {
            const nodeIdStr = ref.nodeId.toString();
            if (seenNodes.has(nodeIdStr)) continue;
            seenNodes.add(nodeIdStr);

            children.push({
              arrow: referenceToSymbol(ref) + symbol(ref)[0],
              displayName: ref.displayName.text || ref.browseName.toString(),
              nodeId: ref.nodeId,
              nodeClass: ref.nodeClass as number,
              typeDefinition: ref.typeDefinition,
            });
          }
        }
      }

      // Resolve type names
      const typesToRead: { nodeId: NodeId; index: number }[] = [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i] as any;
        if (child.typeDefinition && !child.typeDefinition.isEmpty()) {
          const typeNodeId = NodeId.resolveNodeId(child.typeDefinition);
          const cacheKey = typeNodeId.toString();
          if (this.typeNameCache.has(cacheKey)) {
            child.typeDefinitionName = this.typeNameCache.get(cacheKey);
          } else {
            typesToRead.push({ nodeId: typeNodeId, index: i });
          }
        }
      }

      if (typesToRead.length > 0) {
        // Read browse names of types in batch
        const nodesToRead = typesToRead.map((t) => ({
          nodeId: t.nodeId,
          attributeId: AttributeIds.BrowseName,
        }));
        const dataValues = await this.session!.read(nodesToRead);
        for (let j = 0; j < dataValues.length; j++) {
          const dv = dataValues[j];
          const typeNodeId = typesToRead[j].nodeId;
          const childIndex = typesToRead[j].index;
          let typeName = "";
          if (dv.statusCode === StatusCodes.Good && dv.value.value) {
            typeName = dv.value.value.name || dv.value.value.toString();
            this.typeNameCache.set(typeNodeId.toString(), typeName);
          }
          (children[childIndex] as any).typeDefinitionName = typeName;
        }
      }

      return children;
    } catch (err) {
      console.log(err);
      return [];
    }
  }
}
function invert<T extends { toString(): string }>(o: Record<string, T>) {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    r[v.toString()] = k;
  }
  return r;
}
const attributeIdToString = invert(AttributeIds);
const DataTypeIdsToString = invert(DataTypeIds);

function dataValueValueToString(dataValue: DataValue, resolvedEnumString?: string | null) {
  let s = "";
  if (!dataValue.value || dataValue.value.value === null) {
    s = "<???>";
  } else {
    const value = dataValue.value.value;
    switch (dataValue.value.arrayType) {
      case VariantArrayType.Scalar:
        if (resolvedEnumString) {
          s = resolvedEnumString + " (" + value + ")";
        } else {
          s = dataValue.value.toString();
        }
        break;
      case VariantArrayType.Array:
        s = dataValue.value.toString();
        break;
      default:
        s = "";
        break;
    }
  }
  return s;
}

function toString1(attribute: AttributeIds, dataValue: DataValue | null, dataTypeNodeId?: NodeId | null, resolvedEnumString?: string | null) {
  if (!dataValue || !dataValue.value || !dataValue.value.hasOwnProperty("value")) {
    return "<null>";
  }
  const value = (dataValue.value as any).value;
  switch (attribute) {
    case AttributeIds.DataType: {
      const name = (value instanceof NodeId && value.namespace === 0) ? DataTypeIdsToString[value.value.toString()] : undefined;
      return (name || "undefined") + " (" + value.toString() + ")";
    }
    case AttributeIds.NodeClass:
      return NodeClass[value] + " (" + value + ")";
    case AttributeIds.IsAbstract:
    case AttributeIds.Historizing:
    case AttributeIds.EventNotifier:
      return value ? "true" : "false";
    case AttributeIds.WriteMask:
    case AttributeIds.UserWriteMask:
      return " (" + value + ")";
    case AttributeIds.NodeId:
    case AttributeIds.BrowseName:
    case AttributeIds.DisplayName:
    case AttributeIds.Description:
    case AttributeIds.ValueRank:
    case AttributeIds.ArrayDimensions:
    case AttributeIds.Executable:
    case AttributeIds.UserExecutable:
    case AttributeIds.MinimumSamplingInterval:
      if (!value) {
        return "null";
      }
      return value.toString();
    case AttributeIds.UserAccessLevel:
    case AttributeIds.AccessLevel:
      if (!value) {
        return "null";
      }
      return accessLevelFlagToString(value) + " (" + value + ")";
    default:
      return dataValueValueToString(dataValue, resolvedEnumString);
  }
}

