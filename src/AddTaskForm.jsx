import { useState } from "react";
import "./AddTaskForm.css";

function AddTaskForm({ onAddTask, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [status, setStatus] = useState("Nepradėta");

  async function handleSubmit(event) {
    event.preventDefault();
    if (disabled || !title.trim()) return;

    const newTask = {
      title: title.trim(),
      status,
      deadline,
    };

    const saved = await onAddTask(newTask);
    if (!saved) return;

    setTitle("");
    setDeadline("");
    setStatus("Nepradėta");
    setIsOpen(false);
  }

  function handleCancel() {
    setTitle("");
    setDeadline("");
    setStatus("Nepradėta");
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <div className="add-task">
        <button
          type="button"
          className="add-task__open-button"
          onClick={() => setIsOpen(true)}
          disabled={disabled}
        >
          + Nauja užduotis
        </button>
      </div>
    );
  }

  return (
    <div className="add-task">
      <div className="add-task__card">
        <div className="add-task__header">
          <div>
            <h2>Nauja užduotis</h2>
            <p>Pridėkite naują užduotį į savo sąrašą</p>
          </div>

          <button
            type="button"
            className="add-task__close"
            onClick={handleCancel}
            disabled={disabled}
            aria-label="Uždaryti"
          >
            ×
          </button>
        </div>

        <form className="add-task__form" onSubmit={handleSubmit}>
          <label className="add-task__field">
            <span>Užduoties pavadinimas</span>

            <input
              type="text"
              placeholder="Pvz. Sukurti profilio puslapį"
              value={title}
              disabled={disabled}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>

          <label className="add-task__field">
            <span>Terminas</span>

            <input
              type="date"
              value={deadline}
              disabled={disabled}
              onChange={(event) => setDeadline(event.target.value)}
              required
            />
          </label>

          <label className="add-task__field">
            <span>Statusas</span>

            <select
              value={status}
              disabled={disabled}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="Nepradėta">Nepradėta</option>
              <option value="Vykdoma">Vykdoma</option>
              <option value="Atlikta">Atlikta</option>
            </select>
          </label>

          <div className="add-task__actions">
            <button
              type="button"
              className="add-task__cancel"
              onClick={handleCancel}
              disabled={disabled}
            >
              Atšaukti
            </button>

            <button type="submit" className="add-task__submit" disabled={disabled}>
              Pridėti užduotį
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddTaskForm;
