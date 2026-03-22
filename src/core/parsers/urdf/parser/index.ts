import { RobotState } from '@/types';
import { preprocessXML } from './utils';
import { parseMaterials } from './materialParser';
import { parseLinks } from './linkParser';
import { parseJoints } from './jointParser';

export const parseURDF = (xmlString: string): RobotState | null => {
  // Preprocess XML to fix common issues
  xmlString = preprocessXML(xmlString);

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  // Check for XML parsing errors
  const parseError = xmlDoc.querySelector("parsererror");
  if (parseError) {
      console.error("XML parsing error:", parseError.textContent);
      return null;
  }

  const robotEl = xmlDoc.querySelector("robot");
  if (!robotEl) {
      console.error("Invalid URDF: No <robot> tag found.");
      return null;
  }

  const name = robotEl.getAttribute("name") || "imported_robot";

  // Parse Materials
  const { globalMaterials, linkGazeboMaterials } = parseMaterials(robotEl);

  // Parse Links
  const { links, extraJoints, linkMaterials } = parseLinks(robotEl, globalMaterials, linkGazeboMaterials);

  if (Object.keys(links).length === 0) {
      console.error("Invalid URDF: No <link> tags found.");
      return null;
  }

  // Parse Joints
  const joints = parseJoints(robotEl);

  // Add virtual joints from multi-collision parsing
  extraJoints.forEach(j => {
      joints[j.id] = j;
  });

  // 3. Find Root
  // The root link is the one that is never a child in any joint
  const childLinkIds = new Set(Object.values(joints).map(j => j.childLinkId));
  const rootId = Object.keys(links).find(id => !childLinkIds.has(id));

  if (!rootId && Object.keys(links).length > 0) {
      console.warn("Could not determine root link. Selecting first link.");
  }

  const finalRootId = rootId || Object.keys(links)[0] || '';
  const materials = Object.fromEntries(
      Object.entries(linkMaterials)
          .filter(([, material]) => Boolean(material.color || material.texture))
          .map(([linkId, material]) => [linkId, material]),
  );

  return {
      name,
      links,
      joints,
      rootLinkId: finalRootId,
      ...(Object.keys(materials).length > 0 ? { materials } : {}),
      selection: { type: 'link', id: finalRootId }
  };
};
