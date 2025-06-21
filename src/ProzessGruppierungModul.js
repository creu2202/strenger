import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

// Lokale Speicherung
const loadGruppen = () => {
  const saved = localStorage.getItem("prozessGruppen");
  return saved ? JSON.parse(saved) : [];
};

const saveGruppen = (gruppen) => {
  localStorage.setItem("prozessGruppen", JSON.stringify(gruppen));
};

const ProzessGruppierungModul = ({ data }) => {
  const [gruppen, setGruppen] = useState(loadGruppen());
  const [gruppenName, setGruppenName] = useState("");
  const [gewerkFilter, setGewerkFilter] = useState("");
  const [prozessSuche, setProzessSuche] = useState("");

  const alleProzesse = useMemo(() => {
    const map = new Map();
    Object.values(data).forEach((projekt) => {
      projekt.forEach(({ Process, Trade, "Trade Background Color": TradeColor }) => {
        const key = `${Process}___${Trade}`;
        if (!map.has(key)) {
          map.set(key, { Process, Trade, TradeColor });
        }
      });
    });
    return Array.from(map.values());
  }, [data]);

  const alleGewerke = useMemo(() => {
    const set = new Set();
    alleProzesse.forEach((p) => set.add(p.Trade));
    return Array.from(set).sort();
  }, [alleProzesse]);

  useEffect(() => {
    saveGruppen(gruppen);
  }, [gruppen]);

  const addGruppe = () => {
    if (!gruppenName.trim()) return;
    if (gruppen.find((g) => g.name === gruppenName)) return;
    setGruppen([...gruppen, { name: gruppenName, prozesse: [] }]);
    setGruppenName("");
  };

  const addProzessToGruppe = (prozess) => {
    if (gruppen.length === 0) return;
    const letzteGruppe = gruppen[gruppen.length - 1];
    const existiert = letzteGruppe.prozesse.some(
      (p) => p.Process === prozess.Process && p.Trade === prozess.Trade
    );
    if (existiert) return;

    setGruppen((prev) =>
      prev.map((g, i) =>
        i === prev.length - 1
          ? { ...g, prozesse: [...g.prozesse, prozess] }
          : g
      )
    );
  };

  const removeProzess = (gruppenName, prozess) => {
    setGruppen((prev) =>
      prev.map((g) =>
        g.name === gruppenName
          ? {
              ...g,
              prozesse: g.prozesse.filter(
                (p) => !(p.Process === prozess.Process && p.Trade === prozess.Trade)
              ),
            }
          : g
      )
    );
  };

  const renameGruppe = (oldName, newName) => {
    setGruppen((prev) =>
      prev.map((g) => (g.name === oldName ? { ...g, name: newName } : g))
    );
  };

  const deleteGruppe = (name) => {
    setGruppen((prev) => prev.filter((g) => g.name !== name));
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Prozesse */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">🔎 Prozesse</h3>
          <select
            value={gewerkFilter}
            onChange={(e) => setGewerkFilter(e.target.value)}
            className="bg-[#1a1a1a] text-white border border-[#444] text-sm rounded px-2 py-1"
          >
            <option value="">Alle Gewerke</option>
            {alleGewerke.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <input
          type="text"
          placeholder="🔍 Prozessname suchen"
          value={prozessSuche}
          onChange={(e) => setProzessSuche(e.target.value)}
          className="mb-4 w-full bg-[#1a1a1a] text-white border border-[#444] px-3 py-2 rounded"
        />

        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {alleProzesse
            .filter((p) => !gewerkFilter || p.Trade === gewerkFilter)
            .filter((p) => p.Process.toLowerCase().includes(prozessSuche.toLowerCase()))
            .map((p, i) => (
              <div
                key={`${p.Process}-${p.Trade}`}
                onDoubleClick={() => addProzessToGruppe(p)}
                className="p-3 rounded-lg cursor-pointer text-white hover:opacity-90 relative"
                style={{ backgroundColor: p.TradeColor }}
              >
                <span className="absolute top-1 left-2 text-xs text-gray-200 opacity-70">{p.Trade}</span>
                <div className="text-base font-semibold mt-4">{p.Process}</div>
              </div>
            ))}
        </div>
      </div>

      {/* Gruppen */}
      <div>
        <h3 className="text-lg font-semibold mb-4">📦 Gruppen</h3>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={gruppenName}
            onChange={(e) => setGruppenName(e.target.value)}
            placeholder="Neue Gruppe benennen"
            className="bg-[#1a1a1a] text-white border border-[#444] px-3 py-2 rounded w-full"
          />
          <button
            onClick={addGruppe}
            className="bg-[#00e0d6] text-black px-4 py-2 rounded font-semibold"
          >
            ➕
          </button>
        </div>

        {gruppen.map((g) => (
          <motion.div
            key={g.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#2a2a2a] p-4 rounded-lg mb-4"
          >
            <div className="flex items-center mb-2 gap-2">
              <input
                className="bg-transparent text-white font-bold w-full border-b border-gray-600 focus:outline-none"
                value={g.name}
                onChange={(e) => renameGruppe(g.name, e.target.value)}
              />
              <button
                onClick={() => deleteGruppe(g.name)}
                className="text-red-400 hover:text-red-600 text-xl leading-none"
                title="Gruppe löschen"
              >
                ✕
              </button>
            </div>

            <ul className="list-disc pl-5 text-sm text-gray-300">
              {g.prozesse.map((p, i) => (
                <li key={i} className="flex justify-between items-center">
                  <span>{p.Process} ({p.Trade})</span>
                  <button
                    className="text-red-400 text-xs ml-2 hover:underline"
                    onClick={() => removeProzess(g.name, p)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default ProzessGruppierungModul;