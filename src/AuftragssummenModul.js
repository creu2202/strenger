import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { useDrop } from "react-dnd";
import { useDrag, DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Upload, Download, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const excelDateToJSDate = (serial) => {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
};

const isInCurrentWeek = (startDateSerial, endDateSerial) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const start = excelDateToJSDate(startDateSerial);
    const end = excelDateToJSDate(endDateSerial);

    return (
      (start >= startOfWeek && start <= endOfWeek) ||
      (end >= startOfWeek && end <= endOfWeek) ||
      (start < startOfWeek && end > endOfWeek)
    );
  } catch (e) {
    return false;
  }
};

const getTextColor = (rgb) => {
  if (!rgb) return "white";
  const [r, g, b] = rgb.replace(/[^0-9,]/g, "").split(",").map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "black" : "white";
};

const Ticket = ({ task, position, isHighlighted, onClick }) => {
  const ref = useRef(null);
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "TICKET",
    item: () => {
      const rect = ref.current?.getBoundingClientRect();
      return {
        ...task,
        offsetX: rect ? rect.width / 2 : 0,
        offsetY: rect ? rect.height / 2 : 0,
      };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [task]);

  const rgb = task["Trade Background Color"] || "";
  const backgroundColor = `rgb(${rgb.replace(/[^0-9,]/g, "")})`;
  const textColor = getTextColor(rgb);

  return (
    <motion.div
      ref={(node) => {
        drag(node);
        ref.current = node;
      }}
      onClick={() => onClick?.(task.ID)}
      className={`p-2 rounded-xl text-xs font-semibold shadow-lg absolute cursor-grab w-48 transition-transform duration-200 ease-in-out ${
        isDragging ? "opacity-30" : ""
      } ${isHighlighted ? "ring-4 ring-[#00e0d6] z-50" : ""}`}
      style={position ? {
        top: position.y,
        left: position.x,
        position: "absolute",
        backgroundColor,
        color: textColor
      } : {
        position: "relative",
        marginBottom: 8,
        backgroundColor,
        color: textColor
      }}
      initial={{ scale: 0.8 }}
      animate={{ scale: 1 }}
    >
      <div className="font-bold text-[13px] leading-snug mb-0.5">{task.Process}</div>
      <div className="text-[10px] opacity-80 leading-tight">{task["TaktZones"] || "Kein Bereich"}</div>
    </motion.div>
  );
};

const DropZone = ({ onDrop, children, image }) => {
  const zoneRef = useRef(null);
  const [{ isOver }, drop] = useDrop(() => ({
    accept: "TICKET",
    drop: (item, monitor) => {
      const offset = monitor.getClientOffset();
      const zoneRect = zoneRef.current.getBoundingClientRect();
      const position = {
        x: offset.x - zoneRect.left - (item.offsetX || 0),
        y: offset.y - zoneRect.top - (item.offsetY || 0),
      };
      onDrop(item, position);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  return (
    <div
      ref={(node) => {
        drop(node);
        zoneRef.current = node;
      }}
      className={`relative w-full h-full border-2 border-dashed rounded-xl transition-all overflow-hidden flex items-center justify-center ${
        isOver ? "border-[#00e0d6] bg-[#111]" : "border-[#333] bg-[#1a1a1a]"
      } drop-zone-wrapper`}
    >
      <div className="absolute inset-0 z-0">
        {image && (
          <img
            src={image}
            alt="Uploaded"
            className="max-w-full max-h-full object-contain pointer-events-none ring-1 ring-white brightness-110 m-auto"
          />
        )}
      </div>
      <div className="absolute inset-0 z-10">
        {children}
      </div>
    </div>
  );
};


const createEmptyArea = () => ({
  image: null,
  droppedTasks: [],
  ref: React.createRef(),
  heading: "Flächenterminplan"
});

const STORAGE_KEY = "auftragssummen";
const getStorageKey = (projectId, weekNumber) => `${STORAGE_KEY}-${projectId}-KW${weekNumber}`;


const AuftragssummenModul = ({ data, selectedProject }) => {
  const [tasks, setTasks] = useState([]);
  const [highlightedId, setHighlightedId] = useState(null);
  const [areas, setAreas] = useState([createEmptyArea()]);
  const [searchText, setSearchText] = useState("");
const [selectedTrade, setSelectedTrade] = useState("");
const [selectedZone, setSelectedZone] = useState("");
const gefilterteTasks = tasks.filter((task) => {
  const matchesSearch = task.Process.toLowerCase().includes(searchText.toLowerCase());
  const matchesTrade = selectedTrade === "" || task["Trade"] === selectedTrade;
  const matchesZone = selectedZone === "" || task["TaktZones"] === selectedZone;
  return matchesSearch && matchesTrade && matchesZone;
});


  const today = new Date();
  const getStartOfWeek = (date) => {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const [currentWeekStart, setCurrentWeekStart] = useState(getStartOfWeek(today));

  const getWeekRange = (start) => {
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  };

  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  useEffect(() => {
    if (!selectedProject || !data[selectedProject]) return;
  
    const storageKey = getStorageKey(selectedProject, getWeekNumber(currentWeekStart));
    const saved = localStorage.getItem(storageKey);
  
    const { start, end } = getWeekRange(currentWeekStart);
  
    const allFromAPI = data[selectedProject]
      .filter((row) => {
        const startDate = excelDateToJSDate(row["Start Date"]);
        const endDate = excelDateToJSDate(row["End Date"]);
        return (
          (startDate >= start && startDate <= end) ||
          (endDate >= start && endDate <= end) ||
          (startDate < start && endDate > end)
        );
      });
  
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const restoredAreas = parsed.areas.map((a) => ({ ...a, ref: React.createRef() }));
  
        const gültigeIDs = allFromAPI.map((t) => t.ID);
  
        const gefilterteAreas = restoredAreas.map((area) => ({
          ...area,
          droppedTasks: area.droppedTasks.filter((t) => gültigeIDs.includes(t.ID))
        }));
  
        const gefilterteRemaining = (parsed.remainingTasks || []).filter((t) =>
          gültigeIDs.includes(t.ID)
        );
  
        const neueTasks = allFromAPI.filter(
          (t) =>
            !gefilterteAreas.flatMap((a) => a.droppedTasks.map((t) => t.ID)).includes(t.ID) &&
            !gefilterteRemaining.map((t) => t.ID).includes(t.ID)
        );
  
        setAreas(gefilterteAreas);
        setTasks([...gefilterteRemaining, ...neueTasks]);
        return;
      } catch (e) {
        console.warn("Fehler beim Laden des gespeicherten Zustands:", e);
      }
    }
  
    const filtered = allFromAPI
      .sort((a, b) => excelDateToJSDate(a["Start Date"]) - excelDateToJSDate(b["Start Date"]));
  
    setTasks(filtered);
    setAreas([createEmptyArea()]);
  }, [selectedProject, data, currentWeekStart]);
  
  
  
  useEffect(() => {
    if (!selectedProject) return;
  
    const storageKey = getStorageKey(selectedProject, getWeekNumber(currentWeekStart));
    const cleanAreas = areas.map(({ image, heading, droppedTasks }) => ({
      image,
      heading,
      droppedTasks
    }));
  
    const toSave = {
      areas: cleanAreas,
      remainingTasks: tasks
    };
  
    localStorage.setItem(storageKey, JSON.stringify(toSave));
  }, [areas, tasks, selectedProject, currentWeekStart]);
  

  const handleHighlight = (id) => {
    setHighlightedId(id);
    setTimeout(() => setHighlightedId(null), 2000);
  };

  const handleImageUpload = (index, img) => {
    const newAreas = [...areas];
    newAreas[index].image = img;
    setAreas(newAreas);
  };

  const handleDrop = (areaIndex, task, position) => {
    setAreas((prev) => {
      const updated = [...prev];
      const exists = updated[areaIndex].droppedTasks.find((t) => t.ID === task.ID);
      if (exists) {
        updated[areaIndex].droppedTasks = updated[areaIndex].droppedTasks.map((t) =>
          t.ID === task.ID ? { ...t, position } : t
        );
      } else {
        updated[areaIndex].droppedTasks.push({ ...task, position });
      }
      return updated;
    });
    setTasks((prev) => prev.filter((t) => t.ID !== task.ID));
  };

  const handleHeadingChange = (index, newText) => {
    const newAreas = [...areas];
    newAreas[index].heading = newText;
    setAreas(newAreas);
  };

  const addArea = () => {
    setAreas((prev) => [...prev, createEmptyArea()]);
  };

  const clearWeekData = () => {
    if (!selectedProject) return;
    const storageKey = getStorageKey(selectedProject, getWeekNumber(currentWeekStart));
    localStorage.removeItem(storageKey);
    // Neu laden:
    const { start, end } = getWeekRange(currentWeekStart);
    const filtered = data[selectedProject]
      .filter((row) => {
        const startDate = excelDateToJSDate(row["Start Date"]);
        const endDate = excelDateToJSDate(row["End Date"]);
        return (
          (startDate >= start && startDate <= end) ||
          (endDate >= start && endDate <= end) ||
          (startDate < start && endDate > end)
        );
      })
      .sort((a, b) => excelDateToJSDate(a["Start Date"]) - excelDateToJSDate(b["Start Date"]));
  
    setTasks(filtered);
    setAreas([createEmptyArea()]);
  };
  

  const exportToPDF = async () => {
    const pdf = new jsPDF("landscape", "pt", "a3");

    for (let i = 0; i < areas.length; i++) {
      const areaRef = areas[i].ref?.current;
      if (!areaRef) continue;

      const mainBackground = areaRef;
      const kwText = areaRef.querySelector(".kw-line");
      const imageWrapper = areaRef.querySelector(".drop-zone-wrapper");
      const vorgaengeHeader = areaRef.querySelector(".right-column h2");
      const headingInput = areaRef.querySelector('input[type="text"]');

      const originalMainBg = mainBackground.style.backgroundColor;
      const originalKWColor = kwText?.style.color;
      const originalImageBg = imageWrapper?.style.backgroundColor;
      const originalVorgaengeColor = vorgaengeHeader?.style.color;
      const originalHeadingColor = headingInput?.style.color;

      mainBackground.style.backgroundColor = "#ffffff";
      if (kwText) kwText.style.color = "#000000";
      if (imageWrapper) imageWrapper.style.backgroundColor = "#ffffff";
      if (vorgaengeHeader) vorgaengeHeader.style.color = "#000000";
      if (headingInput) headingInput.style.color = "#000000";

      const headingClone = headingInput?.cloneNode(true);
      if (headingClone) headingClone.style.display = "none";
      if (headingInput) headingInput.style.display = "none";

      const canvas = await html2canvas(areaRef, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff"
      });

      if (headingInput) headingInput.style.display = "";

      const imgData = canvas.toDataURL("image/png");
      const width = pdf.internal.pageSize.getWidth();
      const height = pdf.internal.pageSize.getHeight();

      // Titel und KW-Datum oberhalb platzieren
      pdf.setFontSize(20);
      pdf.setTextColor("black");
      pdf.text(headingInput?.value || "Flächenterminplan", 40, 40);
      pdf.setFontSize(12);
      pdf.text(`KW ${weekNumber} (${start.toLocaleDateString("de-DE")} - ${end.toLocaleDateString("de-DE")})`, 40, 60);

      // Bild darunter einfügen (Start bei y=80)
      pdf.addImage(imgData, "PNG", 40, 80, width - 80, height - 120);
      pdf.setFontSize(10);
      pdf.setTextColor("black");
      pdf.text(`Stand: ${new Date().toLocaleDateString("de-DE")}`, 40, height - 30);

      // Reset styles
      mainBackground.style.backgroundColor = originalMainBg;
      if (kwText) kwText.style.color = originalKWColor || "";
      if (imageWrapper) imageWrapper.style.backgroundColor = originalImageBg || "";
      if (vorgaengeHeader) vorgaengeHeader.style.color = originalVorgaengeColor || "";
      if (headingInput) headingInput.style.color = originalHeadingColor || "";

      if (i < areas.length - 1) pdf.addPage();
    }

    pdf.save(`Flaechenterminplaene_${selectedProject}.pdf`);
  };


  const changeWeek = (direction) => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + direction * 7);
    setCurrentWeekStart(newStart);
  };

  const resetToCurrentWeek = () => {
    setCurrentWeekStart(getStartOfWeek(today));
  };

  const isCurrentWeek = getStartOfWeek(today).getTime() === currentWeekStart.getTime();

  const { start, end } = getWeekRange(currentWeekStart);
  const weekNumber = getWeekNumber(currentWeekStart);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex w-full justify-center bg-[#111] font-inter text-white px-2">
        <div className="flex w-[calc(100vw-2rem)] max-w-[1400px] flex-col">
          <div className="sticky top-0 z-50 bg-[#111] py-4">
            <div className="flex justify-center items-center gap-4 text-xl font-bold">
              <button onClick={() => changeWeek(-1)}><ChevronLeft /></button>
              <span>KW {weekNumber} ({start.toLocaleDateString("de-DE")} - {end.toLocaleDateString("de-DE")})</span>
              <button onClick={() => changeWeek(1)}><ChevronRight /></button>
            </div>
            <div className="flex justify-center mt-2">
              {isCurrentWeek ? (
                <span className="text-sm text-gray-400">Aktuelle Woche</span>
              ) : (
                <button onClick={resetToCurrentWeek} className="text-sm text-[#00e0d6] underline hover:text-[#00bfa5]">Zurück zur aktuellen Woche</button>
              )}
            </div>
          </div>

          <div className="flex w-full">
          <div className="w-[250px] p-4 overflow-y-auto max-h-[calc(100vh-100px)] pr-2 sticky top-[90px] h-fit bg-[#111] border-r border-[#222]">
  {/* Filter: Prozesssuche */}
  <input
    type="text"
    placeholder="🔍 Prozess suchen"
    value={searchText}
    onChange={(e) => setSearchText(e.target.value)}
    className="w-full mb-2 px-2 py-1 rounded text-sm bg-[#222] text-white border border-[#333] focus:ring-2 focus:ring-[#00e0d6] transition"
  />

  {/* Filter: Gewerk */}
  <select
    value={selectedTrade}
    onChange={(e) => setSelectedTrade(e.target.value)}
    className="w-full mb-2 px-2 py-1 rounded text-sm bg-[#222] text-white border border-[#333] focus:ring-2 focus:ring-[#00e0d6] transition"
  >
    <option value="">📂 Alle Gewerke</option>
    {Array.from(new Set(tasks.map(t => t["Trade"]))).sort().map((trade) => (
      <option key={trade} value={trade}>{trade}</option>
    ))}
  </select>

  {/* Filter: Bereich */}
  <select
    value={selectedZone}
    onChange={(e) => setSelectedZone(e.target.value)}
    className="w-full mb-4 px-2 py-1 rounded text-sm bg-[#222] text-white border border-[#333] focus:ring-2 focus:ring-[#00e0d6] transition"
  >
    <option value="">🗂️ Alle Bereiche</option>
    {Array.from(new Set(tasks.map(t => t["TaktZones"]))).sort().map((zone) => (
      <option key={zone} value={zone}>{zone || "Kein Bereich"}</option>
    ))}
  </select>

  {/* Reset-Button */}
  {(searchText || selectedTrade || selectedZone) && (
    <button
      onClick={() => {
        setSearchText("");
        setSelectedTrade("");
        setSelectedZone("");
      }}
      className="w-full mb-4 text-sm text-[#00e0d6] hover:text-[#00bfa5] transition underline"
    >
      🔄 Filter zurücksetzen
    </button>
  )}

  {/* Gefilterte Vorgänge anzeigen */}
  {gefilterteTasks.length > 0 ? (
    gefilterteTasks.map((task) => (
      <Ticket key={task.ID} task={task} onClick={handleHighlight} />
    ))
  ) : (
    <p className="text-gray-400 text-sm">Keine Vorgänge gefunden.</p>
  )}
</div>
            <div className="flex-1 p-4 flex flex-col gap-12">
              {areas.map((area, index) => (
                <div key={index} ref={area.ref} className="flex flex-col gap-2 border border-white p-4 rounded-xl bg-[#1a1a1a]">
                  <input
                    type="text"
                    value={area.heading}
                    onChange={(e) => handleHeadingChange(index, e.target.value)}
                    className="text-3xl font-bold text-center text-white w-full mb-2 bg-transparent"
                  />
                  <div className="flex flex-row gap-4">
                    <div className="bg-layer flex-1 relative aspect-[141/100] max-h-[calc(100vh-100px)]">
                      <DropZone
                        image={area.image}
                        onDrop={(item, pos) => handleDrop(index, item, pos)}
                      >
                        {area.droppedTasks.map((task) => (
                          <Ticket
                            key={task.ID}
                            task={task}
                            position={task.position}
                            isHighlighted={highlightedId === task.ID}
                            onClick={handleHighlight}
                          />
                        ))}
                      </DropZone>
                      {!area.image && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 z-20 bg-[#1a1a1a] bg-opacity-90">
                          <Upload className="w-10 h-10 mb-2" />
                          <p className="mb-2">PDF oder Bild hochladen</p>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = () => handleImageUpload(index, reader.result);
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                    <div className="w-[250px] overflow-hidden pl-2 right-column">
                      <h2 className="text-xl font-bold mb-4 text-white">📌 Verortete Vorgänge</h2>
                      {area.droppedTasks.length > 0 ? area.droppedTasks.map((task) => {
                        const rgb = task["Trade Background Color"] || "";
                        const backgroundColor = `rgb(${rgb.replace(/[^0-9,]/g, "")})`;
                        const textColor = getTextColor(rgb);
                        return (
                          <div
                            key={task.ID}
                            onClick={() => handleHighlight(task.ID)}
                            className={`p-2 rounded-xl text-xs mb-2 shadow border border-[#333] cursor-pointer transition duration-200 ${highlightedId === task.ID ? "ring-2 ring-[#00e0d6]" : ""}`}
                            style={{ backgroundColor, color: textColor }}
                          >
                            <div className="font-bold text-[13px] leading-snug mb-0.5">{task.Process}</div>
                            <div className="text-[10px] opacity-80 leading-tight">{task["TaktZones"] || "Kein Bereich"}</div>
                          </div>
                        );
                      }) : <p className="text-gray-400 text-sm">Keine Vorgänge verortet.</p>}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex gap-4 justify-center">
                <button
                  onClick={addArea}
                  className="bg-[#00e0d6] text-black px-4 py-2 rounded hover:bg-[#00bfa5] flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Weitere Ansicht hinzufügen
                </button>
                <button
                  onClick={exportToPDF}
                  className="bg-[#00e0d6] text-black px-4 py-2 rounded hover:bg-[#00bfa5] flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Export als PDF
                </button>
                <button
    onClick={clearWeekData}
    className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 flex items-center gap-2"
  >
    🧹 Zurücksetzen
  </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
};

export default AuftragssummenModul;
