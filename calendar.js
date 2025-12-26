// Calendar functionality for Skillflow

(function() {
  'use strict';

  // Calendar state
  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let viewMode = 'month'; // 'month' or 'week'
  let selectedEvent = null;

  // Helper functions
  const $ = (q) => document.querySelector(q);
  const $$ = (q) => Array.from(document.querySelectorAll(q));

  // Get calendar events from global state
  function getCalendarEvents() {
    return window.calendarEvents || [];
  }

  // Save calendar events to global state
  function saveCalendarEvents(events) {
    window.calendarEvents = events;
    try {
      localStorage.setItem('calendar_events_v1', JSON.stringify(events));
      if (window.markDirty) window.markDirty();
    } catch(e) {
      console.error('Failed to save calendar events:', e);
    }
  }

  // Get saved outlines from global state
  function getSavedOutlines() {
    // Try multiple possible locations where savedOutlines might be stored
    if (window.savedOutlines && Array.isArray(window.savedOutlines)) {
      return window.savedOutlines;
    }
    // Try loading from localStorage as fallback
    try {
      const stored = localStorage.getItem('saved_outlines_v1');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch(e) {
      console.error('Failed to load outlines:', e);
    }
    return [];
  }

  // Get outline by ID
  function getOutlineById(id) {
    const outlines = getSavedOutlines();
    return outlines.find(o => o.id === id);
  }

  // Format date helpers
  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  // Get events for a specific date
  function getEventsForDate(dateStr) {
    return getCalendarEvents().filter(e => e.date === dateStr);
  }

  // Calculate total duration from sections
  function getTotalDuration(sections) {
    if (!sections || !Array.isArray(sections)) return 0;
    return sections.reduce((sum, s) => sum + (s.minutes || 0), 0);
  }

  // Render calendar grid
  function renderMonthView() {
    const grid = $('#calendarGrid');
    if (!grid) return;

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const prevLastDay = new Date(currentYear, currentMonth, 0);

    const firstDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const daysInPrevMonth = prevLastDay.getDate();

    let html = '<div class="calendar-header">';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
      html += `<div class="cal-day-name">${day}</div>`;
    });
    html += '</div>';

    // Previous month days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      html += `<div class="cal-day other-month"><div class="cal-day-number">${day}</div></div>`;
    }

    // Current month days
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const events = getEventsForDate(dateStr);

      let dayClass = 'cal-day';
      if (isToday) dayClass += ' today';

      html += `<div class="${dayClass}" data-date="${dateStr}">`;
      html += `<div class="cal-day-number">${day}</div>`;

      if (events.length > 0) {
        html += '<div class="cal-events">';
        const visibleEvents = events.slice(0, 2);
        visibleEvents.forEach(event => {
          const time = event.time ? formatTime(event.time) + ' ' : '';
          const outline = getOutlineById(event.outlineId);
          const duration = outline ? getTotalDuration(outline.sections) : 0;
          const durationStr = duration > 0 ? `(${duration}m)` : '';
          html += `<div class="cal-event-label" data-event-id="${event.id}">${time}${event.title || 'Untitled'} ${durationStr}</div>`;
        });
        if (events.length > 2) {
          html += `<div class="cal-event-count">+${events.length - 2}</div>`;
        }
        html += '</div>';
      }

      html += '</div>';
    }

    // Next month days
    const totalCells = firstDayOfWeek + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
      html += `<div class="cal-day other-month"><div class="cal-day-number">${day}</div></div>`;
    }

    grid.innerHTML = html;

    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthYearEl = $('#calMonthYear');
    if (monthYearEl) {
      monthYearEl.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    }

    // Update today's schedule
    renderTodaySchedule();

    // Setup drag and drop
    setupDragAndDrop();
  }

  // Render today's schedule summary
  function renderTodaySchedule() {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const events = getEventsForDate(todayStr);

    const card = $('#todayScheduleCard');
    const list = $('#todayScheduleList');

    if (!card || !list) return;

    if (events.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';

    // Sort events by time
    events.sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    let html = '';
    events.forEach(event => {
      const outline = getOutlineById(event.outlineId);
      const duration = outline ? getTotalDuration(outline.sections) : 0;

      html += `<div class="schedule-item" data-event-id="${event.id}">`;
      html += `<div class="schedule-time">${event.time ? formatTime(event.time) : 'All day'}</div>`;
      html += '<div class="schedule-content">';
      html += `<div class="schedule-title">${event.title || 'Untitled'}</div>`;
      html += `<div class="schedule-meta">${duration} min`;
      if (event.notes) html += ` • ${event.notes}`;
      html += '</div></div>';
      html += '<div class="schedule-actions">';
      html += `<button class="px-2 py-1 rounded-lg bg-[var(--accent)] text-white text-xs" onclick="window.startEventSession('${event.id}')">Start</button>`;
      html += '</div></div>';
    });

    list.innerHTML = html;

    // Also update overview widget
    renderOverviewSchedule(events, todayStr);
  }

  // Render today's schedule on Overview tab
  function renderOverviewSchedule(events, todayStr) {
    const card = $('#overviewTodaySchedule');
    const list = $('#overviewScheduleList');

    if (!card || !list) return;

    // If not provided, calculate today's events
    if (!events) {
      const today = new Date();
      todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      events = getEventsForDate(todayStr);
    }

    if (events.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';

    // Sort events by time
    events.sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    let html = '';
    events.forEach(event => {
      const outline = getOutlineById(event.outlineId);
      const duration = outline ? getTotalDuration(outline.sections) : 0;

      html += `<div class="schedule-item" data-event-id="${event.id}">`;
      html += `<div class="schedule-time">${event.time ? formatTime(event.time) : 'All day'}</div>`;
      html += '<div class="schedule-content">';
      html += `<div class="schedule-title">${event.title || 'Untitled'}</div>`;
      html += `<div class="schedule-meta">${duration} min`;
      if (event.notes) html += ` • ${event.notes}`;
      html += '</div></div>';
      html += '<div class="schedule-actions">';
      html += `<button class="px-2 py-1 rounded-lg bg-[var(--accent)] text-white text-xs" onclick="window.startEventSession('${event.id}')">Start</button>`;
      html += '</div></div>';
    });

    list.innerHTML = html;
  }

  // Render today's schedule on Session page
  function renderSessionSchedule() {
    const card = $('#sessionTodaySchedule');
    const list = $('#sessionScheduleList');

    if (!card || !list) return;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const events = getEventsForDate(todayStr);

    if (events.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';

    // Sort events by time
    events.sort((a, b) => {
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    let html = '';
    events.forEach(event => {
      const outline = getOutlineById(event.outlineId);
      const duration = outline ? getTotalDuration(outline.sections) : 0;

      html += `<div class="schedule-item" data-event-id="${event.id}">`;
      html += `<div class="schedule-time">${event.time ? formatTime(event.time) : 'All day'}</div>`;
      html += '<div class="schedule-content">';
      html += `<div class="schedule-title">${event.title || 'Untitled'}</div>`;
      html += `<div class="schedule-meta">${duration} min`;
      if (event.notes) html += ` • ${event.notes}`;
      html += '</div></div>';
      html += '<div class="schedule-actions">';
      html += `<button class="px-2 py-1 rounded-lg bg-[var(--accent)] text-white text-xs" onclick="window.startEventSession('${event.id}')">Start</button>`;
      html += '</div></div>';
    });

    list.innerHTML = html;
  }

  // Open event modal
  function openEventModal(eventId = null, date = null, preselectedOutlineId = null) {
    const modal = $('#calendarEventModal');
    const select = $('#eventOutlineSelect');
    const dateInput = $('#eventDateInput');
    const timeInput = $('#eventTimeInput');
    const notesInput = $('#eventNotesInput');
    const preview = $('#eventPreview');
    const deleteBtn = $('#eventDeleteBtn');
    const saveBtn = $('#eventSaveBtn');
    const titleEl = $('#eventModalTitle');

    if (!modal || !select) return;

    selectedEvent = eventId;

    // Populate outline selector
    const outlines = getSavedOutlines();
    let optionsHtml = '<option value="">Choose an outline...</option>';
    outlines.forEach(outline => {
      optionsHtml += `<option value="${outline.id}">${outline.title || 'Untitled'}</option>`;
    });
    select.innerHTML = optionsHtml;

    console.log('Loaded outlines for calendar:', outlines.length);

    if (eventId) {
      // Edit mode
      const event = getCalendarEvents().find(e => e.id === eventId);
      if (event) {
        titleEl.textContent = 'Edit Scheduled Outline';
        select.value = event.outlineId;
        dateInput.value = event.date;
        timeInput.value = event.time || '';
        notesInput.value = event.notes || '';
        deleteBtn.style.display = 'block';
        updateEventPreview();
      }
    } else {
      // Create mode
      titleEl.textContent = 'Schedule Outline';
      // If preselectedOutlineId is provided, use it; otherwise empty
      select.value = preselectedOutlineId || '';
      dateInput.value = date || '';
      timeInput.value = '';
      notesInput.value = '';
      deleteBtn.style.display = 'none';
      if (preselectedOutlineId) {
        updateEventPreview();
      } else {
        preview.style.display = 'none';
      }
    }

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  // Update event preview
  function updateEventPreview() {
    const select = $('#eventOutlineSelect');
    const preview = $('#eventPreview');
    const previewContent = $('#eventPreviewContent');

    if (!select || !preview || !previewContent) return;

    const outlineId = select.value;
    if (!outlineId) {
      preview.style.display = 'none';
      return;
    }

    const outline = getOutlineById(outlineId);
    if (!outline) {
      preview.style.display = 'none';
      return;
    }

    const duration = getTotalDuration(outline.sections);
    const sectionCount = outline.sections ? outline.sections.length : 0;

    previewContent.innerHTML = `
      <strong>${outline.title || 'Untitled'}</strong><br>
      ${sectionCount} section${sectionCount !== 1 ? 's' : ''} • ${duration} minutes total
    `;

    preview.style.display = 'block';
  }

  // Save event
  function saveEvent() {
    const select = $('#eventOutlineSelect');
    const dateInput = $('#eventDateInput');
    const timeInput = $('#eventTimeInput');
    const notesInput = $('#eventNotesInput');

    if (!select || !dateInput) return;

    const outlineId = select.value;
    const date = dateInput.value;

    if (!outlineId || !date) {
      alert('Please select an outline and date');
      return;
    }

    const outline = getOutlineById(outlineId);
    if (!outline) {
      alert('Outline not found');
      return;
    }

    const events = getCalendarEvents();

    if (selectedEvent) {
      // Update existing event
      const index = events.findIndex(e => e.id === selectedEvent);
      if (index !== -1) {
        events[index] = {
          ...events[index],
          outlineId,
          date,
          time: timeInput.value || null,
          notes: notesInput.value || '',
          title: outline.title || 'Untitled'
        };
      }
    } else {
      // Create new event
      const newEvent = {
        id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        outlineId,
        date,
        time: timeInput.value || null,
        notes: notesInput.value || '',
        title: outline.title || 'Untitled'
      };
      events.push(newEvent);
    }

    saveCalendarEvents(events);
    closeEventModal();
    renderCalendar();
  }

  // Delete event
  function deleteEvent() {
    if (!selectedEvent) return;

    if (!confirm('Delete this scheduled event?')) return;

    const events = getCalendarEvents();
    const filtered = events.filter(e => e.id !== selectedEvent);
    saveCalendarEvents(filtered);
    closeEventModal();
    renderCalendar();
  }

  // Close event modal
  function closeEventModal() {
    const modal = $('#calendarEventModal');
    if (!modal) return;

    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    selectedEvent = null;
  }

  // Start session from event
  function startEventSession(eventId) {
    const event = getCalendarEvents().find(e => e.id === eventId);
    if (!event) return;

    const outline = getOutlineById(event.outlineId);
    if (!outline) {
      alert('Outline not found');
      return;
    }

    // Load the outline into current session
    if (window.currentSession) {
      window.currentSession = outline.sections || [];
      try {
        localStorage.setItem('current_session_v1', JSON.stringify(window.currentSession));
        if (window.renderAll) window.renderAll();
        if (window.markDirty) window.markDirty();
      } catch(e) {
        console.error('Failed to load session:', e);
      }
    }

    // Switch to Session tab
    if (window.showTab) {
      window.showTab('homeTab');
    }
  }

  // Render week view
  function renderWeekView() {
    const grid = $('#weekGrid');
    if (!grid) return;

    // Get the week containing the first day of current month
    const firstDay = new Date(currentYear, currentMonth, 1);
    const weekStart = new Date(firstDay);
    weekStart.setDate(firstDay.getDate() - firstDay.getDay()); // Start on Sunday

    let html = '';

    // Header row with days
    html += '<div class="week-time-label"></div>'; // Empty corner
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      const isToday = day.toDateString() === new Date().toDateString();
      html += `<div class="week-time-label" style="text-align:center;${isToday ? 'font-weight:800;color:var(--accent-600);' : ''}">
        ${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
      </div>`;
    }

    // Time slots (6 AM to 10 PM)
    for (let hour = 6; hour <= 22; hour++) {
      const timeLabel = `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
      html += `<div class="week-time-label">${timeLabel}</div>`;

      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + dayOffset);
        const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(hour).padStart(2, '0')}:00`;

        const events = getEventsForDate(dateStr).filter(e => {
          if (!e.time) return hour === 9; // All-day events show at 9 AM
          const eventHour = parseInt(e.time.split(':')[0]);
          return eventHour === hour;
        });

        html += `<div class="week-cell" data-date="${dateStr}" data-time="${timeStr}">`;
        events.forEach(event => {
          const outline = getOutlineById(event.outlineId);
          const duration = outline ? getTotalDuration(outline.sections) : 0;
          const durationStr = duration > 0 ? ` (${duration}m)` : '';
          html += `<div class="week-event" data-event-id="${event.id}" draggable="true">${event.title || 'Untitled'}${durationStr}</div>`;
        });
        html += '</div>';
      }
    }

    grid.innerHTML = html;

    // Update month/year display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthYearEl = $('#calMonthYear');
    if (monthYearEl) {
      const endDay = new Date(weekStart);
      endDay.setDate(weekStart.getDate() + 6);
      monthYearEl.textContent = `Week of ${monthNames[weekStart.getMonth()]} ${weekStart.getDate()}, ${weekStart.getFullYear()}`;
    }

    setupDragAndDrop();
  }

  // Navigate calendar
  function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendar();
  }

  function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar();
  }

  function goToToday() {
    const today = new Date();
    currentMonth = today.getMonth();
    currentYear = today.getFullYear();
    renderCalendar();
  }

  // Drag and drop for events
  let draggedEventId = null;

  function setupDragAndDrop() {
    // Event dragging
    document.querySelectorAll('.cal-event-label, .week-event').forEach(el => {
      el.setAttribute('draggable', 'true');

      el.addEventListener('dragstart', (e) => {
        draggedEventId = el.dataset.eventId;
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
        e.stopPropagation(); // Prevent parent handlers
      });

      el.addEventListener('dragend', (e) => {
        el.classList.remove('dragging');
        draggedEventId = null;
      });

      // Prevent click event immediately after drag
      el.addEventListener('click', (e) => {
        if (draggedEventId) {
          e.stopPropagation();
          e.preventDefault();
        }
      });
    });

    // Drop targets (calendar days and week cells)
    document.querySelectorAll('.cal-day, .week-cell').forEach(cell => {
      cell.addEventListener('dragover', (e) => {
        if (!draggedEventId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('drag-over');
      });

      cell.addEventListener('dragleave', (e) => {
        cell.classList.remove('drag-over');
      });

      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        cell.classList.remove('drag-over');

        if (!draggedEventId) return;

        const newDate = cell.dataset.date;
        const newTime = cell.dataset.time;

        if (!newDate) return;

        // Update event
        const events = getCalendarEvents();
        const event = events.find(e => e.id === draggedEventId);
        if (event) {
          event.date = newDate;
          if (newTime) {
            event.time = newTime;
          }
          saveCalendarEvents(events);
          renderCalendar();
        }
      });
    });
  }

  // Main render function
  function renderCalendar() {
    const monthBtn = $('#calViewMonth');
    const weekBtn = $('#calViewWeek');
    const calGrid = $('#calendarGrid');
    const weekViewEl = $('#weekView');

    if (viewMode === 'month') {
      renderMonthView();
      if (calGrid && calGrid.parentElement) {
        calGrid.parentElement.style.display = 'block';
      }
      if (weekViewEl) weekViewEl.style.display = 'none';

      if (monthBtn) {
        monthBtn.classList.add('bg-[var(--accent)]', 'text-white');
        monthBtn.classList.remove('border', 'border-[var(--border)]');
      }
      if (weekBtn) {
        weekBtn.classList.remove('bg-[var(--accent)]', 'text-white');
        weekBtn.classList.add('border', 'border-[var(--border)]');
      }
    } else {
      renderWeekView();
      if (calGrid && calGrid.parentElement) {
        calGrid.parentElement.style.display = 'none';
      }
      if (weekViewEl) weekViewEl.style.display = 'block';

      if (weekBtn) {
        weekBtn.classList.add('bg-[var(--accent)]', 'text-white');
        weekBtn.classList.remove('border', 'border-[var(--border)]');
      }
      if (monthBtn) {
        monthBtn.classList.remove('bg-[var(--accent)]', 'text-white');
        monthBtn.classList.add('border', 'border-[var(--border)]');
      }
    }
  }

  // Event listeners
  function setupEventListeners() {
    // Month navigation
    const prevBtn = $('#calPrevMonth');
    const nextBtn = $('#calNextMonth');
    const todayBtn = $('#calToday');

    if (prevBtn) prevBtn.addEventListener('click', prevMonth);
    if (nextBtn) nextBtn.addEventListener('click', nextMonth);
    if (todayBtn) todayBtn.addEventListener('click', goToToday);

    // View toggle
    const monthBtn = $('#calViewMonth');
    const weekBtn = $('#calViewWeek');

    if (monthBtn) monthBtn.addEventListener('click', () => {
      viewMode = 'month';
      renderCalendar();
    });

    if (weekBtn) weekBtn.addEventListener('click', () => {
      viewMode = 'week';
      renderCalendar();
    });

    // Calendar day clicks
    document.addEventListener('click', (e) => {
      const day = e.target.closest('.cal-day');
      if (day && !day.classList.contains('other-month')) {
        const date = day.dataset.date;
        if (date) {
          openEventModal(null, date);
        }
      }

      // Event label clicks
      const eventLabel = e.target.closest('.cal-event-label');
      if (eventLabel) {
        e.stopPropagation();
        const eventId = eventLabel.dataset.eventId;
        if (eventId) {
          openEventModal(eventId);
        }
      }

      // Schedule item clicks
      const scheduleItem = e.target.closest('.schedule-item');
      if (scheduleItem && !e.target.closest('button')) {
        const eventId = scheduleItem.dataset.eventId;
        if (eventId) {
          openEventModal(eventId);
        }
      }
    });

    // Modal controls
    const modal = $('#calendarEventModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.dataset.close === '1' || e.target.classList.contains('modal-backdrop')) {
          closeEventModal();
        }
      });
    }

    const saveBtn = $('#eventSaveBtn');
    const deleteBtn = $('#eventDeleteBtn');
    const outlineSelect = $('#eventOutlineSelect');

    if (saveBtn) saveBtn.addEventListener('click', saveEvent);
    if (deleteBtn) deleteBtn.addEventListener('click', deleteEvent);
    if (outlineSelect) outlineSelect.addEventListener('change', updateEventPreview);
  }

  // Initialize
  function init() {
    setupEventListeners();
    renderCalendar();
  }

  // Export to window
  window.renderCalendar = renderCalendar;
  window.openEventModal = openEventModal;
  window.startEventSession = startEventSession;
  window.updateEventPreview = updateEventPreview;
  window.renderOverviewSchedule = renderOverviewSchedule;
  window.renderSessionSchedule = renderSessionSchedule;

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
