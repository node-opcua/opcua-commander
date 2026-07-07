process.env.TERM = "ansi";
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

    namespace.addAnalogDataItem({
      componentOf: myDevice,
      browseName: "MyAnalogVariable",
      dataType: "Double",
      value: new Variant({ dataType: DataType.Double, value: 50.0 }),
      engineeringUnitsRange: { low: 0.0, high: 100.0 },
      engineeringUnits: {
        displayName: "°C",
        description: "degrees Celsius"
      }
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

  it("should test tree expandPath and investigate history navigation in isolation", async () => {
    const { Tree } = await import("../lib/widget/widget_tree.js");
    const { resolveNodeId, sameNodeId } = await import("node-opcua-client");

    const rootFolderId = resolveNodeId("RootFolder");
    const child1Id = resolveNodeId("ns=1;i=1001");
    const child2Id = resolveNodeId("ns=1;i=1002");

    const rootData: any = {
      name: "RootFolder",
      nodeId: rootFolderId,
      expanded: false,
      children: (node: any, callback: any) => {
        callback(null, [
          {
            name: "Child1",
            nodeId: child1Id,
            children: (node2: any, callback2: any) => {
              callback2(null, [
                {
                  name: "Child2",
                  nodeId: child2Id,
                  children: [],
                }
              ]);
            }
          }
        ]);
      }
    };

    // We mock the tree structure and bound methods
    const mockTree: any = {
      __data: rootData,
      items: [] as any[],
      selected: 0,
      screen: {
        render() {}
      },
      
      setData(data: any) {
        this.__data = data;
        // Rebuild mock items list synchronously like walk()
        this.items = [];
        const walkMock = (node: any) => {
          this.items.push({
            node: node,
          });
          if (node.expanded && Array.isArray(node.children)) {
            for (const child of node.children) {
              walkMock(child);
            }
          }
        };
        walkMock(this.__data);
      },

      select(index: number) {
        this.selected = index;
      },

      scrollTo(index: number) {
        // mock
      },
    };

    // Bind and execute the actual production expandPath code
    const expandPath = Tree.prototype.expandPath;
    await expandPath.call(mockTree, [rootFolderId, child1Id, child2Id]);

    expect(mockTree.items.length).toBe(3); // Root, Child1, Child2
    const selectedItem = mockTree.items[mockTree.selected];
    expect(selectedItem).toBeDefined();
    expect(selectedItem.node).toBeDefined();
    expect(selectedItem.node.nodeId.toString()).toBe(child2Id.toString());
  });

  it("should test smart parent history tracking and forward jump navigation in View", async () => {
    const { View } = await import("../lib/view/view.js");
    const { resolveNodeId } = await import("node-opcua-client");

    const rootFolderId = resolveNodeId("RootFolder");
    const child1Id = resolveNodeId("ns=1;i=1001");
    const child2Id = resolveNodeId("ns=1;i=1002");

    const child1Path = [rootFolderId, child1Id];
    const child2Path = [rootFolderId, child1Id, child2Id];

    // Create a mock View instance with only the fields we need
    const mockView: any = {
      _history: [] as any[][],
      _historyIndex: -1,
      _isPushingToHistory: false,
    };

    const pushToHistory = (View.prototype as any)["_pushToHistory"];

    // 1. Initial push of child1Path
    pushToHistory.call(mockView, child1Path);
    expect(mockView._history.length).toBe(1);
    expect(mockView._historyIndex).toBe(0);

    // 2. Push child2Path (navigating deeper)
    pushToHistory.call(mockView, child2Path);
    expect(mockView._history.length).toBe(2);
    expect(mockView._historyIndex).toBe(1);

    // 3. Navigate up to the parent (child1Path) via collapse/<-
    // Since the previous history entry (index 0) is already child1Path,
    // it should optimize and just decrement the index back to 0.
    pushToHistory.call(mockView, child1Path);
    expect(mockView._historyIndex).toBe(0);
    expect(mockView._history.length).toBe(2);
    expect(mockView._history[0]).toEqual(child1Path);
    expect(mockView._history[1]).toEqual(child2Path);

    // 4. Now let's test the insertion case where the previous entry is NOT the parent.
    // Reset view history
    mockView._history = [];
    mockView._historyIndex = -1;

    const unrelatedPath = [resolveNodeId("ns=1;i=9999")];

    // Push unrelatedPath, then child2Path (so previous is NOT parent)
    pushToHistory.call(mockView, unrelatedPath);
    pushToHistory.call(mockView, child2Path);
    expect(mockView._historyIndex).toBe(1);

    // Now navigate up to child1Path (which is parent of child2Path)
    pushToHistory.call(mockView, child1Path);

    // It should have inserted child1Path before child2Path
    // History should be: [unrelatedPath, child1Path, child2Path]
    // Index should remain 1, pointing to the newly inserted child1Path
    expect(mockView._historyIndex).toBe(1);
    expect(mockView._history.length).toBe(3);
    expect(mockView._history[1]).toEqual(child1Path);
    expect(mockView._history[2]).toEqual(child2Path);

    // 5. If we now go forward (index increases to 2), we jump back to child2Path!
    expect(mockView._history[mockView._historyIndex + 1]).toEqual(child2Path);
  });

  it("should enrich the displayed Value attribute and include a separate EURange line if EURange or EngineeringUnits properties are present", async () => {
    // 1. Browse objects/MyDevice to find MyAnalogVariable
    const objectsFolder = {
      nodeId: "i=85",
      nodeClass: NodeClass.Object,
    };
    const objectsChildren = await model.expand_opcua_node(objectsFolder);
    const myDeviceChild = objectsChildren.find((c) => c.displayName === "MyDevice");
    expect(myDeviceChild).toBeDefined();

    const deviceChildren = await model.expand_opcua_node(myDeviceChild!);
    const analogVarChild = deviceChildren.find((c) => c.displayName === "MyAnalogVariable");
    expect(analogVarChild).toBeDefined();

    // 2. Read attributes of MyAnalogVariable
    const attributes = await model.readNodeAttributes(analogVarChild!.nodeId);

    // 3. Verify Value contains "°C"
    const valueAttr = attributes.find((a) => a.attribute === "Value");
    expect(valueAttr).toBeDefined();
    expect(valueAttr!.text).toContain("50");
    expect(valueAttr!.text).toContain("°C");

    // 4. Verify separate EURange attribute line exists and contains "[ 0, 100 ]"
    const rangeAttr = attributes.find((a) => a.attribute === "EURange");
    expect(rangeAttr).toBeDefined();
    expect(rangeAttr!.text).toBe("[ 0, 100 ]");
  });
});

