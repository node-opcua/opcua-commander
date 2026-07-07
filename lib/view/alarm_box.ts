import { Widgets } from "blessed";
import { ClientAlarmList, EventStuff } from "node-opcua-client";
import wrap from "wordwrap";
import truncate from "cli-truncate";

function ellipsys(a: any) {
  if (!a) {
    return "";
  }
  return truncate(a, 20, { position: "middle" });
}
function formatMultiline(s: string | null | undefined, width: number): string[] {
  if (!s) {
    return [""];
  }
  return wrap(80)(s).split("\n");
}
function n(a: any) {
  if (a === null || a === undefined) {
    return "";
  }
  return a.toString();
}
function f(flag: boolean): string {
  return flag ? "X" : "_";
}
export async function updateAlarmBox(clientAlarms: ClientAlarmList, alarmBox: Widgets.ListTableElement, headers: any) {
  const data = [headers];

  for (const alarm of clientAlarms.alarms()) {
    const fields = alarm.fields as any;
    const isEnabled = fields.enabledState && fields.enabledState.id && fields.enabledState.id.value;

    const sourceName = fields.sourceName && fields.sourceName.value ? fields.sourceName.value.toString() : "";

    const message = fields.message && fields.message.value ? (fields.message.value.text || fields.message.value.toString()) : "";
    const m = formatMultiline(message, 80);
    for (let i = 0; i < m.length; i++) {
      const aa = m[i];
      if (i === 0) {
        data.push([
          alarm.eventType.toString(),
          alarm.conditionId.toString(),
          sourceName,
          // fields.branchId.value.toString(),
          // ellipsys(alarm.eventId.toString("hex")),
          isEnabled ? aa : "-",
          isEnabled ? (fields.severity ? fields.severity.value + " (" + fields.lastSeverity.value + ")" : "?") : "-",
          f(isEnabled) +
            (isEnabled ? f(fields.activeState.id.value) : "-") +
            (isEnabled ? f(fields.ackedState.id.value) : "-") +
            (isEnabled ? f(fields.confirmedState.id.value) : "-"),
          // (isEnabled ? f(fields.retain.value) : "-"),
          isEnabled ? (fields.comment && fields.comment.value ? ellipsys(fields.comment.value.text) : "") : "-",
        ]);
      } else {
        data.push([
          "",
          "",
          "",
          // fields.branchId.value.toString(),
          // ellipsys(alarm.eventId.toString("hex")),
          isEnabled ? aa : "-",
          isEnabled ? "" : "-",
          "",
          // (isEnabled ? f(fields.retain.value) : "-"),
          "",
        ]);
      }
    }
  }
  alarmBox.setRows(data);
  alarmBox.screen.render();
}
