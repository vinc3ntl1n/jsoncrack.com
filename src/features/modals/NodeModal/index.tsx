import React from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Text,
  ScrollArea,
  Flex,
  CloseButton,
  Button,
  TextInput,
  Group,
} from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import { modify, applyEdits } from "jsonc-parser";
import { toast } from "react-hot-toast";
import useFile from "../../../store/useFile";
import useJson from "../../../store/useJson";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";

// Normalize node data to valid JSON string
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";

  // Single primitive value with no key - stringify the value directly
  if (nodeRows.length === 1 && !nodeRows[0].key) {
    return JSON.stringify(nodeRows[0].value, null, 2);
  }

  // Object with key-value pairs - build object excluding arrays and nested objects
  const obj: Record<string, any> = {};
  nodeRows.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// Return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

// Safely update JSON at the given path using jsonc-parser
const updateJsonAtPath = (jsonString: string, path: NodeData["path"], newValue: any): string => {
  try {
    if (!path || path.length === 0) {
      // Root node - replace entire document
      return JSON.stringify(newValue, null, 2);
    }

    // Use jsonc-parser to modify the value at the given path
    const edits = modify(jsonString, path, newValue, { formattingOptions: { tabSize: 2 } });
    const updatedJson = applyEdits(jsonString, edits);
    return updatedJson;
  } catch (error) {
    console.error("Failed to update JSON at path:", error);
    // Return original JSON if modification fails
    return jsonString;
  }
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setSelectedNode = useGraph(state => state.setSelectedNode);
  const getNodes = () => useGraph.getState().nodes;
  const getJson = useJson(state => state.getJson);
  const setContents = useFile(state => state.setContents);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editedFields, setEditedFields] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (opened && nodeData) {
      // Initialize fields from node data
      const fields: Record<string, string> = {};

      if (nodeData.text.length === 1 && !nodeData.text[0].key) {
        // Single primitive value
        fields["value"] = String(nodeData.text[0].value ?? "");
      } else {
        // Object with key-value pairs
        nodeData.text.forEach(row => {
          if (row.key && row.type !== "array" && row.type !== "object") {
            fields[row.key] = String(row.value ?? "");
          }
        });
      }

      setEditedFields(fields);
      setIsEditing(false);
    }
  }, [opened, nodeData]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (nodeData) {
      // Reset fields to original values
      const fields: Record<string, string> = {};

      if (nodeData.text.length === 1 && !nodeData.text[0].key) {
        fields["value"] = String(nodeData.text[0].value ?? "");
      } else {
        nodeData.text.forEach(row => {
          if (row.key && row.type !== "array" && row.type !== "object") {
            fields[row.key] = String(row.value ?? "");
          }
        });
      }

      setEditedFields(fields);
    }
    setIsEditing(false);
  };

  const handleFieldChange = (key: string, value: string) => {
    setEditedFields(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    try {
      const currentJson = getJson();
      const path = nodeData?.path;

      let parsedValue: any;

      // Handle single primitive value
      if (nodeData?.text.length === 1 && !nodeData.text[0].key) {
        const rawValue = editedFields["value"];
        // Try to parse as JSON to detect numbers, booleans, null
        try {
          parsedValue = JSON.parse(rawValue);
        } catch {
          // If parsing fails, treat as string
          parsedValue = rawValue;
        }
      } else {
        // Get the current value at this path to preserve nested structures
        const currentData = JSON.parse(currentJson);
        let currentValue = currentData;

        // Navigate to the current value at the path
        if (path && path.length > 0) {
          for (const segment of path) {
            currentValue = currentValue[segment];
          }
        }

        // Start with the current value to preserve nested objects/arrays
        parsedValue = { ...currentValue };

        // Only update the primitive fields that were edited
        Object.entries(editedFields).forEach(([key, value]) => {
          // Try to parse each value
          try {
            parsedValue[key] = JSON.parse(value);
          } catch {
            parsedValue[key] = value;
          }
        });
      }

      // Update JSON at the specific path
      const updatedJson = updateJsonAtPath(currentJson, path, parsedValue);

      // Update stores - only call setContents, which will trigger graph update automatically
      setContents({ contents: updatedJson, hasChanges: true });

      toast.success("Value updated successfully");
      setIsEditing(false);

      // Close the modal
      onClose();

      // Re-select the node by matching its path after graph updates
      setTimeout(() => {
        const nodes = getNodes();
        const matchingNode = nodes.find(node => {
          if (!node.path || !path) return false;
          return JSON.stringify(node.path) === JSON.stringify(path);
        });

        if (matchingNode) {
          setSelectedNode(matchingNode);
        }
      }, 50);
    } catch (error) {
      toast.error("Failed to update value. Please check your input.");
      console.error("Update error:", error);
    }
  };

  const renderEditableFields = () => {
    if (!nodeData) return null;

    const isSingleValue = nodeData.text.length === 1 && !nodeData.text[0].key;

    if (isSingleValue) {
      return (
        <TextInput
          label="Value"
          value={editedFields["value"] || ""}
          onChange={e => handleFieldChange("value", e.currentTarget.value)}
          styles={{
            input: {
              fontFamily: "monospace",
              fontSize: "12px",
            },
          }}
        />
      );
    }

    return (
      <Stack gap="xs">
        {nodeData.text
          .filter(row => row.key && row.type !== "array" && row.type !== "object")
          .map(row => (
            <TextInput
              key={row.key}
              label={row.key || ""}
              value={editedFields[row.key!] || ""}
              onChange={e => handleFieldChange(row.key!, e.currentTarget.value)}
              styles={{
                input: {
                  fontFamily: "monospace",
                  fontSize: "12px",
                },
              }}
            />
          ))}
      </Stack>
    );
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <CloseButton onClick={onClose} />
          </Flex>
          {isEditing ? (
            <ScrollArea.Autosize mah={400} maw={600}>
              <Stack gap="md" miw={350} p="xs">
                {renderEditableFields()}
              </Stack>
            </ScrollArea.Autosize>
          ) : (
            <ScrollArea.Autosize mah={250} maw={600}>
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            </ScrollArea.Autosize>
          )}
          {isEditing ? (
            <Group justify="flex-end">
              <Button variant="default" size="xs" onClick={handleCancel}>
                Cancel
              </Button>
              <Button size="xs" onClick={handleSave}>
                Save
              </Button>
            </Group>
          ) : (
            <Group justify="flex-end">
              <Button variant="default" size="xs" onClick={handleEdit}>
                Edit
              </Button>
            </Group>
          )}
        </Stack>
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
    </Modal>
  );
};
