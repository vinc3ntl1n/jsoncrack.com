import React, { useState, useEffect } from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Button, Textarea, Group } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj: Record<string, any> = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const nodes = useGraph(state => state.nodes);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (nodeData && opened) {
      const content = normalizeNodeData(nodeData.text ?? []);
      setEditValue(content);
    }
  }, [nodeData, opened]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!nodeData) return;

    try {
      // Parse the edited value to validate it's valid JSON
      JSON.parse(editValue);

      // Update the node's text content
      const updatedNode: NodeData = {
        ...nodeData,
        text: [
          {
            key: nodeData.text[0]?.key ?? null,
            value: editValue,
            type: "string",
          },
        ],
      };

      // Update nodes array in the graph store
      const updatedNodes = nodes.map(node => (node.id === nodeData.id ? updatedNode : node));

      // Update the graph state
      useGraph.setState({ nodes: updatedNodes, selectedNode: updatedNode });

      setIsEditing(false);
    } catch (error) {
      // Invalid JSON, show error or keep editing
      alert("Invalid JSON format");
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (nodeData) {
      setEditValue(normalizeNodeData(nodeData.text ?? []));
    }
  };

  if (!nodeData) {
    return null;
  }

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered title="Node Content">
      <Stack pb="sm" gap="sm">
        {!isEditing ? (
          <>
            <Stack gap="xs">
              <Text fz="xs" fw={500}>
                Content
              </Text>
              <ScrollArea.Autosize mah={250} maw={600}>
                <CodeHighlight
                  code={normalizeNodeData(nodeData?.text ?? [])}
                  miw={350}
                  maw={600}
                  language="json"
                  withCopyButton
                />
              </ScrollArea.Autosize>
            </Stack>
            <Stack gap="xs">
              <Text fz="xs" fw={500}>
                JSON Path
              </Text>
              <ScrollArea.Autosize maw={600}>
                <CodeHighlight
                  code={jsonPathToString(nodeData?.path)}
                  miw={350}
                  mah={250}
                  language="json"
                  copyLabel="Copy to clipboard"
                  copiedLabel="Copied to clipboard"
                  withCopyButton
                />
              </ScrollArea.Autosize>
            </Stack>
            <Button onClick={handleEdit} variant="default" fullWidth>
              Edit
            </Button>
          </>
        ) : (
          <>
            <Stack gap="xs">
              <Text fz="xs" fw={500}>
                Edit Content
              </Text>
              <Textarea
                label="New Value"
                placeholder="Enter new value (must be valid JSON)"
                value={editValue}
                onChange={e => setEditValue(e.currentTarget.value)}
                minRows={4}
                maxRows={10}
                styles={{ input: { fontFamily: "monospace" } }}
              />
            </Stack>
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleSave} variant="filled">
                Save
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
};
