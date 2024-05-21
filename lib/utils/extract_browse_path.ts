import {
  IBasicSessionAsync,
  NodeId,
  AttributeIds,
  QualifiedName,
  getOptionsForSymmetricSignAndEncrypt,
  BrowseDirection,
  StatusCodes,
  resolveNodeId,
  sameNodeId,
  makeBrowsePath,
} from "node-opcua-client";

async function readBrowseName(session: IBasicSessionAsync, nodeId: NodeId): Promise<QualifiedName> {
  const node = await session.read({ nodeId, attributeId: AttributeIds.BrowseName });
  return node.value.value;
}
async function getParent(session: IBasicSessionAsync, nodeId: NodeId): Promise<{ sep: string; parentNodeId: NodeId } | null> {
  let browseResult = await session.browse({
    browseDirection: BrowseDirection.Inverse,
    includeSubtypes: true,
    nodeId,
    nodeClassMask: 0xff,
    resultMask: 0xff,
    referenceTypeId: "HasChild",
  });
  if (browseResult.statusCode === StatusCodes.Good && browseResult.references?.length) {
    const parentNodeId = browseResult.references[0].nodeId;
    return { sep: ".", parentNodeId };
  }
  browseResult = await session.browse({
    browseDirection: BrowseDirection.Inverse,
    includeSubtypes: true,
    nodeId,
    nodeClassMask: 0xff,
    resultMask: 0xff,
    referenceTypeId: "Organizes",
  });
  if (browseResult.statusCode === StatusCodes.Good && browseResult.references?.length) {
    const parentNodeId = browseResult.references[0].nodeId;
    return { sep: "/", parentNodeId };
  }
  return null;
}
export async function extractBrowsePath(session: IBasicSessionAsync, nodeId: NodeId): Promise<string> {
  try {
    const browseName = await readBrowseName(session, nodeId);
    const pathElements = [];
    pathElements.push(`${browseName.namespaceIndex}:${browseName.name}`);

    let parent = await getParent(session, nodeId);
    while (parent) {
      if (sameNodeId(parent.parentNodeId, resolveNodeId("RootFolder"))) {
        break;
      }

      const browseName = await readBrowseName(session, parent.parentNodeId);
      pathElements.unshift(`${browseName.namespaceIndex}:${browseName.name}${parent.sep}`);
      parent = await getParent(session, parent.parentNodeId);
    }
    const browsePath = "/" + pathElements.join("");

    // verification
    const a = await session.translateBrowsePath(makeBrowsePath("i=84", browsePath));
    return browsePath + " (" + a.targets[0]?.targetId?.toString() + ")";
  } catch (err) {
    return "err" + (err as Error).message;
  }
}
