from pathlib import Path

path = Path(__file__).resolve().parent.parent / 'src' / 'routes' / 'inventory.jsx'
text = path.read_text()
start_marker = 'const handleSaveScrap = async (event) => {'
end_marker = 'const handleEnableSelectionMode = () => {'
start = text.find(start_marker)
end = text.find(end_marker, start)
if start == -1 or end == -1:
    raise SystemExit(f'markers not found: start={start}, end={end}')
new_block = '''  const handleSaveScrap = async (event) => {
    event.preventDefault();
    const rawType = newScrap.typeOfOutward || "Scrap";
    const type = normalizeOutwardType(rawType);
    const typeLabel =
      type === "failedQc"
        ? "Failed QC"
        : type === "sales"
        ? "Sales"
        : type === "event"
        ? "Event"
        : "Scrap";

    const defaultRemarks = type === "failedQc" ? "Fail" : typeLabel === "Scrap" ? "Scrap" : "";
    const remarksValue = newScrap.reason?.trim() || defaultRemarks;

    const componentRows =
      type === "sales" || type === "event"
        ? (newScrap.items || []).filter((row) => String(row.component || "").trim())
        : [{ component: newScrap.component, qty: newScrap.qty }];

    if (!componentRows.length) {
      alert("Please add at least one component.");
      return;
    }

    const eventComponentsPayload = JSON.stringify(
      componentRows.map((item) => ({ component: item.component, qty: Number(item.qty) || 1 })),
    );

    const items = componentRows.map((row, index) => {
      const qty = Number(row.qty) || 1;
      return {
        id: `${Date.now()}-${index}`,
        component: row.component || "Unnamed Component",
        productName: row.component || "Unnamed Component",
        qty,
        outDate: newScrap.date || today,
        date: newScrap.date || today,
        typeOfOutward: rawType,
        type,
        typeLabel,
        invoiceNumber: newScrap.invoiceNumber || "",
        client: newScrap.client || "",
        deliverables: newScrap.deliverables || "",
        eventName: newScrap.eventName || "",
        attendeeName: newScrap.attendeeName || "",
        eventComponents: eventComponentsPayload,
        event_components: eventComponentsPayload,
        noOfComponents: Number(newScrap.noOfComponents || qty),
        no_of_components: Number(newScrap.noOfComponents || qty),
        returnDate: newScrap.returnDate || newScrap.return_date || "",
        return_date: newScrap.returnDate || newScrap.return_date || "",
        remarks: remarksValue,
        status: typeLabel === "Event" ? "PENDING" : "ACTIVE",
      };
    });

    persistScrap([...items, ...scrapEntries]);
    setNewScrap(emptyScrapItem);
    setShowNewScrap(false);
    setTab(type === "sales" || type === "event" ? type : "scrap");
  };
'''
new_text = text[:start] + new_block + text[end:]
path.write_text(new_text)
print('handleSaveScrap block replaced')
