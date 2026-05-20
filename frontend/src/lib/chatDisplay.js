/** Group chat rows: user bubbles + agent turn event batches. */
export function buildDisplayGroups(messages) {
  const groups = [];
  let turnEvents = null;
  let turnIndex = 0;

  for (const msg of messages) {
    if (msg.role === "user") {
      if (turnEvents) {
        groups.push(finishTurn(turnEvents, turnIndex++));
        turnEvents = null;
      }
      groups.push({ type: "user", key: `user-${msg.id}`, messages: [msg] });
      turnEvents = [];
      continue;
    }

    if (turnEvents) {
      turnEvents.push(msg);
    } else {
      groups.push({ type: "single", key: `single-${msg.id}`, messages: [msg] });
    }
  }

  if (turnEvents?.length) {
    groups.push(finishTurn(turnEvents, turnIndex));
  }

  return groups;
}

function finishTurn(events, index) {
  const total = events.length;
  return {
    type: "turn",
    key: `turn-${index}`,
    visible: events,
    hidden: [],
    total,
    hiddenCount: 0,
  };
}
