import ReactMarkdown from "react-markdown";
import { MapPin, CheckCircle2, AlertCircle, Loader2, ChevronRight, Clock } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

function ToolCallDisplay({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const name = toolCall?.name || "Tool";
  const status = toolCall?.status || "pending";

  const parsedResults = (() => {
    if (!toolCall.results) return null;
    try { return typeof toolCall.results === "string" ? JSON.parse(toolCall.results) : toolCall.results; }
    catch { return toolCall.results; }
  })();

  const isError = toolCall.results && (
    (typeof toolCall.results === "string" && /error|failed/i.test(toolCall.results)) ||
    parsedResults?.success === false
  );

  const statusConfig = {
    pending: { icon: Clock, color: "text-slate-400", text: "Pending" },
    running: { icon: Loader2, color: "text-slate-500", text: "Running…", spin: true },
    in_progress: { icon: Loader2, color: "text-slate-500", text: "Running…", spin: true },
    completed: isError
      ? { icon: AlertCircle, color: "text-red-500", text: "Failed" }
      : { icon: CheckCircle2, color: "text-green-500", text: "Done" },
    success: { icon: CheckCircle2, color: "text-green-500", text: "Done" },
    failed: { icon: AlertCircle, color: "text-red-500", text: "Failed" },
    error: { icon: AlertCircle, color: "text-red-500", text: "Failed" },
  }[status] || { icon: MapPin, color: "text-slate-400", text: "" };

  const Icon = statusConfig.icon;
  const label = name.replace(/_/g, " ").toLowerCase();

  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all",
          "hover:bg-secondary/50",
          expanded ? "bg-secondary border-border" : "bg-card border-border"
        )}
      >
        <Icon className={cn("h-3 w-3", statusConfig.color, statusConfig.spin && "animate-spin")} />
        <span className="text-foreground capitalize">{label}</span>
        {statusConfig.text && (
          <span className={cn("text-muted-foreground", isError && "text-red-500")}>· {statusConfig.text}</span>
        )}
        {!statusConfig.spin && (toolCall.arguments_string || parsedResults) && (
          <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform ml-auto", expanded && "rotate-90")} />
        )}
      </button>
      {expanded && !statusConfig.spin && (
        <div className="mt-1.5 ml-3 pl-3 border-l-2 border-border space-y-2">
          {toolCall.arguments_string && (
            <div>
              <div className="text-muted-foreground mb-1">Parameters:</div>
              <pre className="bg-secondary rounded-md p-2 text-xs whitespace-pre-wrap overflow-auto max-h-40">
                {(() => { try { return JSON.stringify(JSON.parse(toolCall.arguments_string), null, 2); } catch { return toolCall.arguments_string; } })()}
              </pre>
            </div>
          )}
          {parsedResults && (
            <div>
              <div className="text-muted-foreground mb-1">Result:</div>
              <pre className="bg-secondary rounded-md p-2 text-xs whitespace-pre-wrap overflow-auto max-h-40">
                {typeof parsedResults === "object" ? JSON.stringify(parsedResults, null, 2) : parsedResults}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
          <MapPin className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div className={cn("max-w-[85%]", isUser && "flex flex-col items-end")}>
        {message.content && (
          <div className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-card border border-border text-foreground rounded-bl-sm"
          )}>
            {isUser ? (
              <p>{message.content}</p>
            ) : (
              <ReactMarkdown
                className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                components={{
                  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
                  li: ({ children }) => <li className="my-0.5">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  code: ({ children }) => <code className="px-1 py-0.5 rounded bg-secondary text-xs">{children}</code>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        )}
        {message.tool_calls?.length > 0 && (
          <div className="space-y-1 w-full">
            {message.tool_calls.map((tc, i) => <ToolCallDisplay key={i} toolCall={tc} />)}
          </div>
        )}
      </div>
    </div>
  );
}