import { motion } from "framer-motion";

export interface FlowNode {
  id: string;
  label: string;
  color: "gray" | "blue" | "green" | "amber" | "red" | "orange";
  description?: string;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
}

interface WorkflowDiagramProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  title?: string;
}

const NODE_COLORS: Record<
  FlowNode["color"],
  { fill: string; stroke: string; text: string }
> = {
  gray: {
    fill: "var(--color-muted)",
    stroke: "var(--color-muted-foreground)",
    text: "var(--color-muted-foreground)",
  },
  blue: {
    fill: "var(--color-status-info-bg)",
    stroke: "var(--color-status-info)",
    text: "var(--color-status-info)",
  },
  green: {
    fill: "var(--color-status-success-bg)",
    stroke: "var(--color-status-success)",
    text: "var(--color-status-success)",
  },
  amber: {
    fill: "var(--color-status-warning-bg)",
    stroke: "var(--color-status-warning)",
    text: "var(--color-status-warning)",
  },
  red: {
    fill: "var(--color-status-error-bg)",
    stroke: "var(--color-status-error)",
    text: "var(--color-status-error)",
  },
  orange: {
    fill: "var(--color-status-warning-bg)",
    stroke: "var(--color-status-warning)",
    text: "var(--color-status-warning)",
  },
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 44;
const NODE_RX = 8;
const VERTICAL_SPACING = 70;
const SVG_WIDTH = 400;
const PADDING_TOP = 30;
const PADDING_BOTTOM = 30;

function getNodePosition(index: number) {
  const x = SVG_WIDTH / 2;
  const y = PADDING_TOP + index * VERTICAL_SPACING + NODE_HEIGHT / 2;
  return { x, y };
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const nodeVariants = {
  hidden: { opacity: 0, y: -8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

export function WorkflowDiagram({ nodes, edges, title }: WorkflowDiagramProps) {
  const svgHeight =
    PADDING_TOP + nodes.length * VERTICAL_SPACING + PADDING_BOTTOM;

  const nodePositions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, index) => {
    nodePositions.set(node.id, getNodePosition(index));
  });

  const edgeDelay = nodes.length * 0.1 + 0.2;

  return (
    <div className="w-full">
      <motion.svg
        role="img"
        aria-label={title || "Workflow diagram"}
        width="100%"
        viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
        preserveAspectRatio="xMidYMin meet"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <polygon
              points="0 0, 8 3, 0 6"
              style={{ fill: "var(--color-muted-foreground)" }}
            />
          </marker>
        </defs>

        {/* Edges rendered behind nodes */}
        {edges.map((edge) => {
          const fromPos = nodePositions.get(edge.from);
          const toPos = nodePositions.get(edge.to);
          if (!fromPos || !toPos) return null;

          const startX = fromPos.x;
          const startY = fromPos.y + NODE_HEIGHT / 2;
          const endX = toPos.x;
          const endY = toPos.y - NODE_HEIGHT / 2;

          const pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
          const pathLength = Math.sqrt(
            (endX - startX) ** 2 + (endY - startY) ** 2
          );

          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;

          return (
            <g key={`${edge.from}-${edge.to}`}>
              <motion.path
                d={pathD}
                style={{ stroke: "var(--color-muted-foreground)" }}
                strokeWidth={1.5}
                fill="none"
                markerEnd="url(#arrowhead)"
                strokeDasharray={
                  edge.style === "dashed" ? "6 4" : `${pathLength}`
                }
                initial={
                  edge.style === "dashed"
                    ? { opacity: 0 }
                    : { strokeDashoffset: pathLength }
                }
                animate={
                  edge.style === "dashed"
                    ? { opacity: 1 }
                    : { strokeDashoffset: 0 }
                }
                transition={{
                  delay: edgeDelay,
                  duration: 0.4,
                  ease: "easeOut",
                }}
              />
              {edge.label && (
                <motion.g
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: edgeDelay + 0.2 }}
                >
                  <rect
                    x={midX - edge.label.length * 3.5 - 4}
                    y={midY - 8}
                    width={edge.label.length * 7 + 8}
                    height={16}
                    rx={4}
                    style={{ fill: "var(--color-background)" }}
                  />
                  <text
                    x={midX}
                    y={midY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fontFamily="inherit"
                    style={{ fill: "var(--color-muted-foreground)" }}
                  >
                    {edge.label}
                  </text>
                </motion.g>
              )}
            </g>
          );
        })}

        {/* Nodes rendered on top */}
        {nodes.map((node) => {
          const pos = nodePositions.get(node.id);
          if (!pos) return null;
          const colors = NODE_COLORS[node.color];

          return (
            <motion.g key={node.id} variants={nodeVariants}>
              <rect
                x={pos.x - NODE_WIDTH / 2}
                y={pos.y - NODE_HEIGHT / 2}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={NODE_RX}
                strokeWidth={1.5}
                style={{ fill: colors.fill, stroke: colors.stroke }}
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={13}
                fontWeight={500}
                fontFamily="inherit"
                style={{ fill: colors.text }}
              >
                {node.label}
              </text>
            </motion.g>
          );
        })}
      </motion.svg>
    </div>
  );
}
