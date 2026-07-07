import { OPCUAServer, Variant, DataType } from "node-opcua";
import { Model } from "../lib/model/model.js";
import { NodeClass, MessageSecurityMode, SecurityPolicy, UserTokenType } from "node-opcua-client";
import { makeCertificate } from "../lib/make_certificate.js";
import { describe, it, beforeAll, afterAll, expect } from "vitest";

describe("OPC UA Commander Business Logic", () => {
  let server: OPCUAServer;
  let model: Model;
  const port = 4335;
  const endpointUrl = `opc.tcp://localhost:${port}`;

  beforeAll(async () => {
    // Start an in-process OPC UA Server for testing
    server = new OPCUAServer({
      port,
      buildInfo: {
        productName: "TestServerVitest",
      },
    });

    await server.initialize();

    const addressSpace = server.engine.addressSpace!;
    const namespace = addressSpace.getOwnNamespace();

    // Add mock items to the address space
    const myDevice = namespace.addObject({
      organizedBy: addressSpace.rootFolder.objects,
      browseName: "MyDevice",
    });

    namespace.addVariable({
      componentOf: myDevice,
      browseName: "MyVariable",
      dataType: "Double",
      value: new Variant({ dataType: DataType.Double, value: 42.0 }),
    });

    // Add a mock Type node to test Subtype Mode inheritance
    const myObjectType = namespace.addObjectType({
      browseName: "MyObjectType",
    });

    namespace.addObjectType({
      subtypeOf: myObjectType,
      browseName: "MySubObjectType",
    });

    await server.start();

    // Initialize and connect Model
    const { certificateFile, clientCertificateManager, applicationName, applicationUri } = await makeCertificate();

    model = new Model();
    await model.initialize(
      endpointUrl,
      MessageSecurityMode.None,
      SecurityPolicy.None,
      certificateFile,
      clientCertificateManager,
      applicationName,
      applicationUri
    );
    await model.doConnect(endpointUrl, { type: UserTokenType.Anonymous });
  }, 45000);

  afterAll(async () => {
    if (model) {
      await model.disconnect();
    }
    if (server) {
      await server.shutdown();
    }
  });

  it("should successfully connect to the server and browse the root folder", async () => {
    const rootNode = {
      nodeId: "i=84", // RootFolder
    };
    const children = await model.expand_opcua_node(rootNode);
    expect(children.length).toBeGreaterThan(0);

    const objectsNode = children.find((c) => c.displayName === "Objects");
    expect(objectsNode).toBeDefined();
    expect(objectsNode!.nodeClass).toBe(NodeClass.Object);
  });

  it("should correctly handle subtypeMode refinement on type nodes vs standard nodes", async () => {
    // 1. When subtypeMode is active, standard object/variable instances should STILL expand normally
    model.subtypeMode = true;

    const objectsFolder = {
      nodeId: "i=85",
      nodeClass: NodeClass.Object,
    };
    const objectsChildren = await model.expand_opcua_node(objectsFolder);
    const myDeviceChild = objectsChildren.find((c) => c.displayName === "MyDevice");
    expect(myDeviceChild).toBeDefined();

    // Expand MyDevice: should still return MyVariable even though subtypeMode is enabled
    const deviceChildren = await model.expand_opcua_node(myDeviceChild!);
    const myVarChild = deviceChildren.find((c) => c.displayName === "MyVariable");
    expect(myVarChild).toBeDefined();

    // 2. When subtypeMode is active on a TYPE node, it should restrict browsing to HasSubtype
    const rootFolder = { nodeId: "i=84", nodeClass: NodeClass.Object };
    const rootChildren = await model.expand_opcua_node(rootFolder);
    const typesFolder = rootChildren.find((c) => c.displayName === "Types");
    expect(typesFolder).toBeDefined();

    const typesChildren = await model.expand_opcua_node(typesFolder!);
    const objectTypesFolder = typesChildren.find((c) => c.displayName === "ObjectTypes");
    expect(objectTypesFolder).toBeDefined();

    const objectTypesChildren = await model.expand_opcua_node(objectTypesFolder!);
    const baseObjectType = objectTypesChildren.find((c) => c.displayName === "BaseObjectType");
    expect(baseObjectType).toBeDefined();

    // Navigate to our customObjectType under BaseObjectType
    const baseObjectTypeChildren = await model.expand_opcua_node(baseObjectType!);
    const myObjectTypeChild = baseObjectTypeChildren.find((c) => c.displayName === "MyObjectType");
    expect(myObjectTypeChild).toBeDefined();

    // Expanding MyObjectType in Subtype Mode should return MySubObjectType (HasSubtype)
    const subTypesChildren = await model.expand_opcua_node(myObjectTypeChild!);
    const mySubObjectTypeChild = subTypesChildren.find((c) => c.displayName === "MySubObjectType");
    expect(mySubObjectTypeChild).toBeDefined();
  });
});
