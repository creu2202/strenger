import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FaUserTie, FaBuilding, FaPlus, FaTrash } from "react-icons/fa";

const BauleiterVerwaltung = ({ projects, onBauleiterChange }) => {
  const [bauleiter, setBauleiter] = useState([]);
  const [newBauleiter, setNewBauleiter] = useState({ name: "", adresse: "", stunden: "" });
  const [zuweisungen, setZuweisungen] = useState({});

  // Lade gespeicherte Bauleiter & Zuweisungen beim Start
  useEffect(() => {
    const savedBauleiter = JSON.parse(localStorage.getItem("bauleiter")) || [];
    const savedZuweisungen = JSON.parse(localStorage.getItem("zuweisungen")) || {};
    setBauleiter(savedBauleiter);
    setZuweisungen(savedZuweisungen);
    onBauleiterChange(savedZuweisungen);
  }, []);

  // Speichere Bauleiter in localStorage
  const saveToStorage = (key, data) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const handleAddBauleiter = () => {
    if (newBauleiter.name && newBauleiter.adresse && newBauleiter.stunden) {
      const updatedBauleiter = [...bauleiter, { ...newBauleiter, id: Date.now() }];
      setBauleiter(updatedBauleiter);
      saveToStorage("bauleiter", updatedBauleiter);
      setNewBauleiter({ name: "", adresse: "", stunden: "" });
    }
  };

  const handleDeleteBauleiter = (id) => {
    const updatedBauleiter = bauleiter.filter((b) => b.id !== id);
    setBauleiter(updatedBauleiter);
    saveToStorage("bauleiter", updatedBauleiter);

    const updatedZuweisungen = { ...zuweisungen };
    delete updatedZuweisungen[id];
    setZuweisungen(updatedZuweisungen);
    saveToStorage("zuweisungen", updatedZuweisungen);
    onBauleiterChange(updatedZuweisungen);
  };

  const handleZuweisung = (bauleiterId, project) => {
    const updatedZuweisungen = { ...zuweisungen, [bauleiterId]: project };
    setZuweisungen(updatedZuweisungen);
    saveToStorage("zuweisungen", updatedZuweisungen);
    onBauleiterChange(updatedZuweisungen);
  };

  return (
    <div className="p-6 font-sans text-white w-full">
      <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
        <FaUserTie className="text-purple-400" /> Bauleiter Verwaltung
      </h2>

      {/* Bauleiter hinzufügen */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4">Neuen Bauleiter anlegen</h3>
        <div className="grid grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Name"
            value={newBauleiter.name}
            onChange={(e) => setNewBauleiter({ ...newBauleiter, name: e.target.value })}
            className="p-2 rounded bg-gray-700 text-white placeholder-gray-400"
          />
          <input
            type="text"
            placeholder="Adresse"
            value={newBauleiter.adresse}
            onChange={(e) => setNewBauleiter({ ...newBauleiter, adresse: e.target.value })}
            className="p-2 rounded bg-gray-700 text-white placeholder-gray-400"
          />
          <input
            type="number"
            placeholder="Stunden/Woche"
            value={newBauleiter.stunden}
            onChange={(e) => setNewBauleiter({ ...newBauleiter, stunden: e.target.value })}
            className="p-2 rounded bg-gray-700 text-white placeholder-gray-400"
          />
        </div>
        <button
          onClick={handleAddBauleiter}
          className="mt-4 flex items-center bg-purple-600 px-4 py-2 rounded-lg shadow-md hover:bg-purple-700 transition"
        >
          <FaPlus className="mr-2" /> Bauleiter hinzufügen
        </button>
      </div>

      {/* Bauleiter Liste */}
      {bauleiter.length > 0 ? (
        <div className="mt-6 bg-gray-800 p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Bauleiter Liste</h3>
          <table className="w-full text-white border-collapse">
            <thead className="bg-gray-700">
              <tr>
                <th className="p-4 text-left">Name</th>
                <th className="p-4 text-left">Adresse</th>
                <th className="p-4 text-left">Stunden</th>
                <th className="p-4 text-left">Projektzuweisung</th>
                <th className="p-4 text-left">Aktionen</th>
              </tr>
            </thead>
            <tbody className="bg-gray-700 divide-y divide-gray-600">
              {bauleiter.map((b) => (
                <tr key={b.id}>
                  <td className="p-4">{b.name}</td>
                  <td className="p-4">{b.adresse}</td>
                  <td className="p-4">{b.stunden}h</td>
                  <td className="p-4">
                    <select
                      className="p-2 bg-gray-700 text-white rounded"
                      value={zuweisungen[b.id] || ""}
                      onChange={(e) => handleZuweisung(b.id, e.target.value)}
                    >
                      <option value="">Kein Projekt</option>
                      {projects.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-4">
                    <button onClick={() => handleDeleteBauleiter(b.id)} className="text-red-400 hover:text-red-600">
                      <FaTrash />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 text-gray-400">Noch keine Bauleiter angelegt.</p>
      )}

      {/* Projektzuweisungen Übersicht */}
      {Object.keys(zuweisungen).length > 0 && (
        <div className="mt-6 bg-gray-800 p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Projektzuweisungen</h3>
          <motion.ul
            className="space-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {Object.entries(zuweisungen).map(([bauleiterId, project]) => {
              const bauleiterObj = bauleiter.find((b) => b.id.toString() === bauleiterId);
              return (
                <li key={bauleiterId} className="p-3 bg-gray-700 rounded-lg flex justify-between items-center">
                  <span>
                    <FaUserTie className="text-purple-400 inline-block mr-2" />{" "}
                    <strong>{bauleiterObj?.name}</strong> → <FaBuilding className="text-blue-400 inline-block mr-2" />{" "}
                    <span className="text-blue-300">{project}</span>
                  </span>
                </li>
              );
            })}
          </motion.ul>
        </div>
      )}
    </div>
  );
};

export default BauleiterVerwaltung;
