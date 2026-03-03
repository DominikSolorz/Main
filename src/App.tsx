import React, { useState, useRef } from 'react';
import { Briefcase, Heart, Phone, Clock, AlertCircle, CheckCircle2, Calendar as CalendarIcon, List as ListIcon, FileText, Printer, ChevronLeft, ChevronRight, Plus, Trash2, Save, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { CONTACT_HISTORY, HistoryEvent } from './data/history';

interface ScheduleDay {
  day: number;
  weekday: string;
  isWork: boolean;
  contact?: {
    type: 'osobiste' | 'telefoniczne';
    time: string;
    status: 'realized' | 'failed' | 'pending' | 'obstructed';
    note?: string;
  };
  appointments: string[];
  isFree: boolean;
}

const DAYS_OF_WEEK = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
const DAYS_OF_WEEK_PL = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

export default function App() {
  const [viewMode, setViewMode] = useState<'calendar' | 'list' | 'report'>('calendar');
  const [currentMonth, setCurrentMonth] = useState(2); // 2 = March
  const [currentYear, setCurrentYear] = useState(2026);
  const [reportRange, setReportRange] = useState<{ start: string; end: string } | null>(null);
  const [isCustomRange, setIsCustomRange] = useState(false);
  
  // State to store all monthly data
  const [allSchedules, setAllSchedules] = useState<Record<string, ScheduleDay[]>>(() => {
    const saved = localStorage.getItem('contact_schedules');
    return saved ? JSON.parse(saved) : {};
  });
  const [editingDay, setEditingDay] = useState<ScheduleDay | null>(null);
  const [newAppointment, setNewAppointment] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);

  // Legal Article Explanations
  const LEGAL_ARTICLES = {
    '113_KRO': {
      title: 'Art. 113 § 1 KRO',
      text: 'Niezależnie od władzy rodzicielskiej rodzice oraz ich dziecko mają prawo i obowiązek utrzymywania ze sobą kontaktów. Obejmują one w szczególności przebywanie z dzieckiem i bezpośrednie porozumiewanie się.',
      context: 'Podstawa obowiązku matki do kontaktu.'
    },
    '598_15_KPC': {
      title: 'Art. 598(15) § 1 KPC',
      text: 'Jeżeli osoba, pod której pieczą dziecko pozostaje, nie wykonuje albo nienależycie wykonuje obowiązki wynikające z orzeczenia albo z ugody zawartej przed sądem, sąd opiekuńczy może zagrozić jej nakazaniem zapłaty na rzecz osoby uprawnionej do kontaktu określonej sumy pieniężnej.',
      context: 'Dotyczy utrudniania lub niewykonywania kontaktów.'
    },
    '95_3_KRO': {
      title: 'Art. 95 § 3 KRO',
      text: 'Władza rodzicielska powinna być wykonywana tak, jak tego wymaga dobro dziecka i interes społeczny.',
      context: 'Uzasadnienie dla ograniczeń podyktowanych bezpieczeństwem dziecka.'
    }
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    
    try {
      // Hide elements that shouldn't be in the PDF
      const hiddenElements = reportRef.current.querySelectorAll('.print\\:hidden');
      hiddenElements.forEach(el => (el as HTMLElement).style.display = 'none');

      const dataUrl = await htmlToImage.toPng(reportRef.current, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });

      // Restore hidden elements
      hiddenElements.forEach(el => (el as HTMLElement).style.display = '');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const img = new Image();
      img.src = dataUrl;
      
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const imgWidth = pdfWidth;
      const imgHeight = (img.height * pdfWidth) / img.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Add subsequent pages if content is longer than one page
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
      
      pdf.save(`Raport_Kontaktow_${MONTH_NAMES[currentMonth]}_${currentYear}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Wystąpił błąd podczas generowania PDF. Spróbuj użyć funkcji drukowania (Ctrl+P).');
    }
  };

  // Persist to localStorage
  React.useEffect(() => {
    localStorage.setItem('contact_schedules', JSON.stringify(allSchedules));
  }, [allSchedules]);

  const MONTH_NAMES = [
    'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'
  ];

  const getInitialSchedule = (month: number, year: number): ScheduleDay[] => {
    const schedule: ScheduleDay[] = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Default data for March 2026
    const marchWorkDays = [1, 4, 6, 7, 10, 11, 14, 15, 16, 18, 19, 22, 23, 25, 26, 27, 29];
    const marchPersonalVisits = [5, 8, 12, 20, 25, 28, 31];
    const marchPhoneCalls = [13, 17, 21];

    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const weekday = DAYS_OF_WEEK[date.getDay()];
      
      let isWork = false;
      let contact: ScheduleDay['contact'] = undefined;
      const appointments: string[] = [];

      if (month === 2 && year === 2026) {
        isWork = marchWorkDays.includes(i);
        if (marchPersonalVisits.includes(i)) {
          contact = { type: 'osobiste', time: '18:00 - 20:00', status: i < 3 ? 'realized' : 'pending' };
        } else if (marchPhoneCalls.includes(i)) {
          contact = { type: 'telefoniczne', time: '18:00 - 20:00', status: i < 3 ? 'realized' : 'pending' };
        }
        
        if (i === 5) appointments.push('Sąd (alimenty) - 11:00');
        if (i === 9) appointments.push('Kamil: Stomatolog - 11:00');
        if (i === 12) {
          appointments.push('MOPS: Treningi (Morcinka 19a)');
          appointments.push('Wizyta kuratorki');
        }
        if (i === 18) appointments.push('Dominik: Neurolog - 17:20');
        if (i === 20) appointments.push('Dominik: Zdrowie Psychiczne - 15:00');
        if (i === 24) appointments.push('Kamil: Gastrolog - 17:00');
      }

      schedule.push({
        day: i,
        weekday,
        isWork,
        contact,
        appointments,
        isFree: !isWork && appointments.length === 0 && !contact
      });
    }
    return schedule;
  };

  const scheduleKey = `${currentYear}-${currentMonth}`;
  const currentSchedule = allSchedules[scheduleKey] || getInitialSchedule(currentMonth, currentYear);

  // Initialize schedule if not exists
  React.useEffect(() => {
    if (!allSchedules[scheduleKey]) {
      setAllSchedules(prev => ({
        ...prev,
        [scheduleKey]: getInitialSchedule(currentMonth, currentYear)
      }));
    }
  }, [scheduleKey]);

  const updateDay = (dayNum: number, updates: Partial<ScheduleDay>) => {
    setAllSchedules(prev => {
      const monthData = [...(prev[scheduleKey] || getInitialSchedule(currentMonth, currentYear))];
      const index = monthData.findIndex(d => d.day === dayNum);
      if (index !== -1) {
        monthData[index] = { ...monthData[index], ...updates };
      }
      return { ...prev, [scheduleKey]: monthData };
    });
  };

  const schedule = currentSchedule;

  // Calendar Grid Logic - Start on Monday
  const getFirstDayOffset = () => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    return firstDay === 0 ? 6 : firstDay - 1; // Adjust for Monday start
  };
  
  const firstDayOffset = getFirstDayOffset();
  const calendarDays = Array(firstDayOffset).fill(null).concat(schedule);

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] text-[#1C1E21] font-sans selection:bg-blue-100">
      <div className="max-w-5xl mx-auto p-3 md:p-8 lg:p-10">
        <header className="mb-6 md:mb-10 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-blue-600 text-white px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest">
                  {MONTH_NAMES[currentMonth]} {currentYear}
                </div>
                <h2 className="text-gray-400 font-bold text-[10px] tracking-widest uppercase">Chronogram Kontaktów</h2>
              </div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight text-gray-900 leading-none">
                {MONTH_NAMES[currentMonth]}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200 w-full md:w-auto justify-between md:justify-start">
                <button 
                  onClick={prevMonth}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-50 transition-all font-bold"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="px-4 py-2 text-sm font-black text-gray-800 min-w-[120px] text-center flex items-center justify-center">
                  {MONTH_NAMES[currentMonth]} {currentYear}
                </div>
                <button 
                  onClick={nextMonth}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-50 transition-all font-bold"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 bg-white p-1 rounded-xl shadow-sm border border-gray-200">
            <button 
              onClick={() => setViewMode('calendar')}
              className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 py-2.5 rounded-lg text-[10px] md:text-sm font-bold transition-all ${viewMode === 'calendar' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <CalendarIcon size={14} className="md:w-4 md:h-4" />
              <span>Kalendarz</span>
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 py-2.5 rounded-lg text-[10px] md:text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <ListIcon size={14} className="md:w-4 md:h-4" />
              <span>Lista</span>
            </button>
            <button 
              onClick={() => {
                setViewMode('report');
                setIsCustomRange(false);
              }}
              className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 py-2.5 rounded-lg text-[10px] md:text-sm font-bold transition-all ${viewMode === 'report' && !isCustomRange ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <FileText size={14} className="md:w-4 md:h-4" />
              <span>Raport</span>
            </button>
          </div>
        </header>

        {/* Custom Range Selector - More compact on mobile */}
        <div className="mb-6 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm print:hidden">
          <div className="flex items-center gap-2 mb-3">
            <CalendarIcon size={16} className="text-blue-600" />
            <span className="text-[11px] font-black text-gray-700 uppercase tracking-tight">Generuj raport za okres:</span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="grid grid-cols-2 gap-2 flex-grow">
              <input 
                type="date" 
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                onChange={(e) => setReportRange(prev => ({ start: e.target.value, end: prev?.end || '' }))}
              />
              <input 
                type="date" 
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                onChange={(e) => setReportRange(prev => ({ start: prev?.start || '', end: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  if (reportRange?.start && reportRange?.end) {
                    setIsCustomRange(true);
                    setViewMode('report');
                  } else {
                    alert('Wybierz obie daty (od i do)');
                  }
                }}
                className="flex-grow sm:flex-none bg-gray-900 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-black transition-all shadow-sm"
              >
                Generuj
              </button>
              <button 
                onClick={() => {
                  const start = `${currentYear}-01-01`;
                  const end = `${currentYear}-12-31`;
                  setReportRange({ start, end });
                  setIsCustomRange(true);
                  setViewMode('report');
                }}
                className="flex-grow sm:flex-none bg-blue-50 text-blue-700 border border-blue-100 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-100 transition-all"
              >
                Roczny
              </button>
            </div>
          </div>
          {isCustomRange && (
            <button 
              onClick={() => setIsCustomRange(false)}
              className="mt-3 text-rose-500 text-[10px] font-black uppercase hover:underline flex items-center gap-1"
            >
              <ChevronLeft size={12} />
              Wróć do widoku miesięcznego
            </button>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-8 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500"></div>
            <span className="text-[10px] font-bold uppercase text-gray-500">Praca</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-rose-500"></div>
            <span className="text-[10px] font-bold uppercase text-gray-500">Wizyta Osobista</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-indigo-500"></div>
            <span className="text-[10px] font-bold uppercase text-gray-500">Telefon</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-amber-500"></div>
            <span className="text-[10px] font-bold uppercase text-gray-500">Wizyta/Sprawa</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-purple-500"></div>
            <span className="text-[10px] font-bold uppercase text-gray-500">Utrudnianie</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {viewMode === 'report' ? (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden print:shadow-none print:border-none print:m-0"
              ref={reportRef}
            >
              <div className="p-8 border-b border-gray-100 flex justify-between items-center print:hidden bg-gray-50">
                <div>
                  <h2 className="text-2xl font-black text-gray-900">Dokumentacja Procesowa</h2>
                  <p className="text-gray-500 text-sm">Zestawienie przebiegu kontaktów dla potrzeb postępowania sądowego</p>
                </div>
                <div className="flex gap-2 print:hidden">
                  <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-3 rounded-xl font-bold hover:bg-gray-200 transition-all"
                  >
                    <Printer size={18} />
                    Drukuj
                  </button>
                  <button 
                    onClick={downloadPDF}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg"
                  >
                    <Download size={18} />
                    Pobierz PDF
                  </button>
                </div>
              </div>

              <div className="p-4 md:p-12 print:p-0 font-serif">
                {/* Formal Header */}
                <div className="mb-8 text-center border-b-2 border-black pb-6">
                  <h1 className="text-xl md:text-2xl font-bold uppercase mb-2 tracking-tight">PROTOKÓŁ DZIENNY PRZEBIEGU KONTAKTÓW I OPIEKI</h1>
                  <p className="text-base md:text-lg font-semibold uppercase">Sąd Rejonowy, V Wydział Rodzinny i Nieletnich</p>
                  <p className="text-sm font-bold mt-1">Sprawa dot. małoletniego: Kamil Solorz</p>
                  <div className="mt-6 flex flex-col md:flex-row justify-between text-left text-sm font-sans gap-6">
                    <div className="flex-1 space-y-1">
                      <p><strong>Wnioskodawca (Opieka/Piecza):</strong> Dominik Solorz</p>
                      <p><strong>Uczestnik (Matka):</strong> Klaudia Wencel</p>
                      <p className="text-[10px] text-gray-500 italic mt-2">Uwaga: Wnioskodawca sprawuje pełną pieczę nad małoletnim. Uczestnik posiada uregulowane prawo do kontaktów.</p>
                    </div>
                    <div className="flex-1 md:text-right space-y-1">
                      <p><strong>Okres sprawozdawczy:</strong> {isCustomRange ? `${reportRange?.start} — ${reportRange?.end}` : `${MONTH_NAMES[currentMonth]} ${currentYear}`}</p>
                      <p><strong>Data sporządzenia:</strong> {new Date().toLocaleDateString('pl-PL')}</p>
                    </div>
                  </div>
                </div>

                {/* Legal Basis Section - Expanded with User's specific requirements */}
                <div className="mb-8 p-4 md:p-6 bg-gray-50 border-l-4 border-blue-600 font-sans print:bg-white print:border-gray-300">
                  <h3 className="text-[10px] md:text-sm font-black uppercase tracking-widest text-blue-800 mb-2 md:mb-3">Podstawa Prawna i Wyjaśnienie Artykułów</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[9px] md:text-[10px] text-gray-700 leading-relaxed">
                    <div className="space-y-2">
                      <p><strong>{LEGAL_ARTICLES['113_KRO'].title}:</strong> {LEGAL_ARTICLES['113_KRO'].text}</p>
                      <p className="text-blue-700 font-bold italic">Znaczenie: Matka ma nie tylko prawo, ale i ustawowy obowiązek dbania o relację z synem.</p>
                    </div>
                    <div className="space-y-2">
                      <p><strong>{LEGAL_ARTICLES['598_15_KPC'].title}:</strong> {LEGAL_ARTICLES['598_15_KPC'].text}</p>
                      <p className="text-rose-700 font-bold italic">Znaczenie: Niewykonywanie kontaktów (np. nieprzyjechanie) lub ich utrudnianie podlega karze finansowej za każde naruszenie.</p>
                    </div>
                  </div>
                </div>

                {/* Consequences Section */}
                <div className="mb-8 p-4 md:p-6 bg-rose-50 border-2 border-rose-200 rounded-xl font-sans print:bg-white print:border-rose-100">
                  <h3 className="text-[10px] md:text-sm font-black uppercase tracking-widest text-rose-800 mb-2">Konsekwencje Niewykonywania Kontaktów</h3>
                  <div className="text-[9px] md:text-[10px] text-rose-900 space-y-2 leading-relaxed">
                    <p className="font-bold">Naruszenie uregulowanych kontaktów przez matkę (Klaudię Wencel) skutkuje:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>Nałożeniem kary pieniężnej:</strong> Sąd może nakazać zapłatę określonej kwoty (np. 200-500 zł) za KAŻDE pojedyncze uniemożliwienie kontaktu.</li>
                      <li><strong>Zwrotem kosztów:</strong> Obowiązkiem zwrotu wydatków poniesionych przez ojca w związku z przygotowaniem do kontaktu (np. koszty dojazdu).</li>
                      <li><strong>Wszczęciem postępowania o zmianę miejsca zamieszkania dziecka:</strong> Uporczywe utrudnianie kontaktów jest traktowane jako brak współpracy i może prowadzić do przekazania opieki ojcu.</li>
                      <li><strong>Nadzorem kuratora:</strong> Sąd może ustanowić stały nadzór kuratora nad sposobem wykonywania kontaktów.</li>
                    </ul>
                  </div>
                </div>

                {/* Daily Protocol List - Every day in range */}
                <div className="mb-10">
                  <h3 className="text-xs font-black uppercase tracking-widest mb-4 border-b border-black pb-2">Szczegółowy Protokół Dzienny</h3>
                  <div className="space-y-4 font-sans">
                    {schedule.map((day, idx) => (
                      <div key={idx} className="border-b border-gray-100 pb-4 print:break-inside-avoid">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-black text-gray-900">{day.day.toString().padStart(2, '0')}.{(currentMonth + 1).toString().padStart(2, '0')}.{currentYear}</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{day.weekday}</span>
                          </div>
                          <div className="flex gap-2">
                            {day.contact ? (
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                                day.contact.status === 'realized' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                day.contact.status === 'failed' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                day.contact.status === 'obstructed' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {day.contact.type === 'osobiste' ? 'Wizyta' : 'Telefon'} - {
                                  day.contact.status === 'realized' ? 'Zrealizowano' :
                                  day.contact.status === 'failed' ? 'Brak Kontaktu' :
                                  day.contact.status === 'obstructed' ? 'Utrudnianie' :
                                  'Oczekiwanie'
                                }
                              </span>
                            ) : (
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded border bg-gray-50 text-gray-400 border-gray-200">
                                Brak zaplanowanego kontaktu
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="pl-4 border-l-2 border-gray-100">
                          <p className="text-xs text-gray-700 leading-relaxed">
                            <span className="font-bold text-gray-500 uppercase text-[9px] mr-2">Przebieg/Uzasadnienie:</span>
                            {day.contact?.note || (day.appointments.length > 0 ? day.appointments.join(', ') : 'Dzień bez incydentów i zaplanowanych kontaktów.')}
                          </p>
                          {day.contact?.status === 'failed' && (
                            <div className="mt-2 p-2 bg-rose-50 border border-rose-100 rounded">
                              <p className="text-[10px] text-rose-700 font-bold uppercase mb-1">Uzasadnienie prawne (Brak Kontaktu):</p>
                              <p className="text-[9px] text-rose-600 leading-tight">
                                Niewykonanie obowiązku z Art. 113 KRO przez matkę. Zgodnie z Art. 598(15) KPC, uporczywe niestawiennictwo na uregulowane kontakty stanowi podstawę do nałożenia kary pieniężnej. Każdy dzień braku kontaktu jest dokumentowany jako naruszenie dobra dziecka.
                              </p>
                            </div>
                          )}
                          {day.contact?.status === 'obstructed' && (
                            <div className="mt-2 p-2 bg-purple-50 border border-purple-100 rounded">
                              <p className="text-[10px] text-purple-700 font-bold uppercase mb-1">Uzasadnienie prawne (Utrudnianie):</p>
                              <p className="text-[9px] text-purple-600 leading-tight">
                                Utrudnianie kontaktu (Art. 598(15) KPC) - nienależyte wykonanie obowiązku. Działania matki uniemożliwiające swobodny przebieg kontaktu (np. spóźnienia, przerywanie rozmów, wywoływanie konfliktów) są dokumentowane jako naruszenie postanowień sądu.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Monthly Summary Statistics */}
                <div className="mb-10 p-4 md:p-6 border-2 border-black rounded-xl font-sans print:break-inside-avoid">
                  <h3 className="text-xs md:text-sm font-black uppercase tracking-widest mb-4">
                    Podsumowanie Okresu ({isCustomRange ? `${reportRange?.start} — ${reportRange?.end}` : `${MONTH_NAMES[currentMonth]} ${currentYear}`})
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div className="p-2 md:p-3 bg-emerald-50 rounded-lg border border-emerald-100 flex flex-col justify-center">
                      <div className="text-xl md:text-2xl font-black text-emerald-700 leading-none mb-1">
                        {schedule.filter(d => d.contact?.status === 'realized').length}
                      </div>
                      <div className="text-[9px] font-bold uppercase text-emerald-600">Zrealizowane</div>
                    </div>
                    <div className="p-2 md:p-3 bg-rose-50 rounded-lg border border-rose-100 flex flex-col justify-center">
                      <div className="text-xl md:text-2xl font-black text-rose-700 leading-none mb-1">
                        {schedule.filter(d => d.contact?.status === 'failed').length}
                      </div>
                      <div className="text-[9px] font-bold uppercase text-rose-600">Brak Kontaktu</div>
                    </div>
                    <div className="p-2 md:p-3 bg-purple-50 rounded-lg border border-purple-100 flex flex-col justify-center">
                      <div className="text-xl md:text-2xl font-black text-purple-700 leading-none mb-1">
                        {schedule.filter(d => d.contact?.status === 'obstructed').length}
                      </div>
                      <div className="text-[9px] font-bold uppercase text-purple-600">Utrudnianie</div>
                    </div>
                    <div className="p-2 md:p-3 bg-amber-50 rounded-lg border border-amber-100 flex flex-col justify-center">
                      <div className="text-xl md:text-2xl font-black text-amber-700 leading-none mb-1">
                        {schedule.filter(d => d.contact?.status === 'pending').length}
                      </div>
                      <div className="text-[9px] font-bold uppercase text-amber-600">Oczekujące</div>
                    </div>
                  </div>
                </div>

                {/* Final Conclusions */}
                <div className="mt-12 pt-8 border-t-2 border-black font-sans">
                  <h3 className="text-xs md:text-sm font-black uppercase tracking-widest mb-4">Wnioski Końcowe i Uwagi Opiekuna</h3>
                  <div className="text-[11px] md:text-sm text-gray-800 space-y-4 leading-relaxed">
                    <p>
                      Analiza powyższego zestawienia wykazuje znaczną nieregularność w utrzymywaniu kontaktów przez matkę małoletniego. Odnotowano liczne okresy całkowitego braku zainteresowania losem dziecka, co stoi w sprzeczności z obowiązkiem wynikającym z <strong>Art. 113 KRO</strong>.
                    </p>
                    <p>
                      W okresie stycznia 2026 r. ograniczono wybrane formy kontaktu telefonicznego wyłącznie w oparciu o <strong>dobro dziecka</strong> (Art. 95 § 3 KRO), ze względu na negatywny wpływ tychże interakcji na stabilność emocjonalną małoletniego. Działania te miały charakter ochronny i były podyktowane koniecznością zapewnienia dziecku poczucia bezpieczeństwa.
                    </p>
                    <div className="mt-10 flex flex-col md:grid md:grid-cols-2 gap-10 md:gap-20">
                      <div className="border-t border-gray-400 pt-2 text-center text-[9px] md:text-[10px] text-gray-500 uppercase">
                        Data i Miejsce
                      </div>
                      <div className="border-t border-gray-400 pt-2 text-center text-[9px] md:text-[10px] text-gray-500 uppercase">
                        Podpis Sporządzającego
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : viewMode === 'calendar' ? (
            <motion.div 
              key="calendar"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden"
            >
              {/* Desktop Grid View */}
              <div className="hidden md:block">
                <div className="bg-gray-800 p-6 border-b-4 border-blue-600 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex flex-col">
                    <h2 className="text-2xl font-black text-white uppercase tracking-widest leading-none">
                      CHRONOGRAM KONTAKTÓW
                    </h2>
                    <span className="text-blue-400 font-bold text-sm mt-1">{MONTH_NAMES[currentMonth]} {currentYear}</span>
                  </div>
                  <div className="flex flex-wrap justify-center gap-4 text-[11px] font-black uppercase text-gray-300 bg-gray-900/50 p-3 rounded-xl border border-gray-700">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                      <span>Zrealizowane</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></div>
                      <span>Brak Kontaktu</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div>
                      <span>Utrudnianie</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-7 bg-gray-100">
                  {DAYS_OF_WEEK_PL.map(day => (
                    <div key={day} className="py-4 text-center text-[12px] font-black text-gray-600 uppercase tracking-widest border-r border-b-2 border-gray-300 last:border-0">
                      {day.slice(0, 3)}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 border-l-2 border-gray-300">
                  {calendarDays.map((day, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => day && setEditingDay(day)}
                        className={`min-h-[160px] p-4 border-r-2 border-b-2 border-gray-300 relative transition-all hover:bg-blue-50/50 cursor-pointer group ${!day ? 'bg-gray-50' : 'bg-white'}`}
                      >
                        {day && (
                          <div className="h-full flex flex-col">
                            <div className="flex justify-between items-start mb-4">
                              <span className={`text-5xl font-black leading-none tracking-tighter tabular-nums ${day.isWork ? 'text-blue-800' : 'text-gray-900'}`}>
                                {day.day}
                              </span>
                              <div className="flex flex-col gap-1.5 items-end">
                                {day.isWork && <Briefcase size={20} className="text-blue-600/20" />}
                                {day.appointments.length > 0 && <AlertCircle size={20} className="text-amber-600/20" />}
                              </div>
                            </div>
                            
                            <div className="flex flex-col gap-2 mt-auto">
                              {day.contact && (
                                <div className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase flex items-center justify-between gap-2 shadow-md border-2 transition-transform group-hover:scale-[1.02] ${
                                  day.contact.status === 'realized' ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 
                                  day.contact.status === 'failed' ? 'bg-rose-50 text-rose-900 border-rose-300' :
                                  day.contact.status === 'obstructed' ? 'bg-purple-50 text-purple-900 border-purple-300' :
                                  'bg-indigo-50 text-indigo-900 border-indigo-300'
                                }`}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    {day.contact.type === 'osobiste' ? <Heart size={16} /> : <Phone size={16} />}
                                    <span className="truncate">{day.contact.type === 'osobiste' ? 'Wizyta' : 'Tel'}</span>
                                  </div>
                                  <div className="flex-shrink-0">
                                    {day.contact.status === 'realized' && <CheckCircle2 size={16} />}
                                    {day.contact.status === 'failed' && <AlertCircle size={16} className="text-rose-600" />}
                                    {day.contact.status === 'obstructed' && <AlertCircle size={16} className="text-purple-600" />}
                                    {day.contact.status === 'pending' && <Clock size={16} />}
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {day.isWork && (
                              <div className="absolute top-0 left-0 w-2.5 h-full bg-blue-600/10"></div>
                            )}
                          </div>
                        )}
                      </div>
                  ))}
                </div>
              </div>

              {/* Mobile List View for Calendar */}
              <div className="md:hidden divide-y-2 divide-gray-200">
                <div className="bg-gray-100 p-4 border-b-2 border-gray-300">
                  <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest text-center">
                    Chronogram: {MONTH_NAMES[currentMonth]} {currentYear}
                  </h2>
                </div>
                {calendarDays.filter(d => d !== null).map((day, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => day && setEditingDay(day)}
                    className={`p-5 flex items-center justify-between cursor-pointer transition-colors active:bg-blue-100 ${day?.isWork ? 'bg-blue-50/50' : 'bg-white'}`}
                  >
                    <div className="flex items-center gap-5">
                      <div className={`text-4xl font-black w-12 ${day?.isWork ? 'text-blue-700' : 'text-gray-300'}`}>
                        {day?.day}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[12px] font-black text-gray-500 uppercase tracking-widest">
                          {day ? day.weekday : ''}
                        </span>
                        {day?.isWork && <span className="text-[10px] font-bold text-blue-600 uppercase">Dzień roboczy</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end max-w-[180px]">
                      {day?.contact && (
                        <div className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase flex items-center gap-2 shadow-sm border-2 ${
                          day.contact.status === 'realized' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 
                          day.contact.status === 'failed' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                          day.contact.status === 'obstructed' ? 'bg-purple-100 text-purple-800 border-purple-300' :
                          'bg-indigo-100 text-indigo-800 border-indigo-300'
                        }`}>
                          {day.contact.type === 'osobiste' ? <Heart size={12} /> : <Phone size={12} />}
                          <span className="truncate">{day.contact.type === 'osobiste' ? 'Wizyta' : 'Tel'}</span>
                          {day.contact.status === 'realized' && <CheckCircle2 size={12} />}
                          {day.contact.status === 'failed' && <AlertCircle size={12} className="text-rose-600" />}
                          {day.contact.status === 'obstructed' && <AlertCircle size={12} className="text-purple-600" />}
                        </div>
                      )}
                      {day?.appointments && day.appointments.length > 0 && (
                        <div className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-800 text-[11px] font-black uppercase flex items-center gap-2 border-2 border-amber-300">
                          <AlertCircle size={12} />
                          {day.appointments.length}S
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-4 max-w-5xl mx-auto"
            >
              {schedule.map((item, index) => (
                <div 
                  key={item.day}
                  className={`bg-white rounded-2xl p-6 border-2 transition-all flex flex-col md:flex-row md:items-center gap-6 ${item.isWork ? 'border-blue-200 bg-blue-50/10' : 'border-gray-100 shadow-sm'}`}
                >
                  <div className="flex items-center gap-6 min-w-[140px] md:min-w-[160px]">
                    <div className="text-4xl md:text-5xl font-black text-gray-200 w-12 md:w-14 text-center tabular-nums">{item.day.toString().padStart(2, '0')}</div>
                    <div className="flex flex-col">
                      <span className="text-[12px] md:text-sm font-black text-gray-500 uppercase tracking-widest">{item.weekday}</span>
                      {item.isWork && <span className="text-[10px] md:text-[12px] font-bold text-blue-600 uppercase mt-1">Dzień roboczy</span>}
                    </div>
                  </div>

                  <div className="flex-grow flex flex-wrap gap-3 md:gap-4">
                    {item.contact && (
                      <div className={`flex items-center gap-3 px-4 md:px-5 py-2 md:py-2.5 rounded-2xl text-sm md:text-base font-bold shadow-sm ${item.contact.type === 'osobiste' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}`}>
                        {item.contact.type === 'osobiste' ? <Heart size={18} className="flex-shrink-0" /> : <Phone size={18} className="flex-shrink-0" />}
                        <div className="flex flex-col">
                          <span className="uppercase text-[10px] md:text-[11px] opacity-70 leading-none mb-1">{item.contact.type === 'osobiste' ? 'Wizyta' : 'Telefon'}</span>
                          <span className="leading-none">{item.contact.time}</span>
                        </div>
                        <div className="ml-2 pl-3 border-l border-current/20">
                          {item.contact.status === 'realized' && <CheckCircle2 size={18} className="text-emerald-600" />}
                          {item.contact.status === 'failed' && <AlertCircle size={18} className="text-rose-600" />}
                          {item.contact.status === 'obstructed' && <AlertCircle size={18} className="text-purple-600" />}
                          {item.contact.status === 'pending' && <Clock size={18} className="text-amber-600" />}
                        </div>
                      </div>
                    )}
                    {item.appointments.map((app, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-amber-50 text-amber-900 px-4 md:px-5 py-2 md:py-2.5 rounded-2xl text-sm md:text-base font-bold border border-amber-200 shadow-sm">
                        <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
                        <span className="break-words leading-tight">{app}</span>
                      </div>
                    ))}
                    {item.isFree && !item.contact && (
                      <div className="flex items-center gap-3 bg-emerald-50 text-emerald-800 px-4 md:px-5 py-2 md:py-2.5 rounded-2xl text-sm md:text-base font-bold border border-emerald-200 shadow-sm">
                        <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
                        <span className="uppercase tracking-wider">Wolne</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {editingDay && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={() => setEditingDay(null)}
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <div>
                    <h3 className="text-2xl font-black text-gray-900">{editingDay.day} {MONTH_NAMES[currentMonth]}</h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{editingDay.weekday}</p>
                  </div>
                  <button onClick={() => setEditingDay(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                    <ChevronLeft size={24} className="text-gray-400" />
                  </button>
                </div>

                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                  {/* Work Toggle */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status Pracy</label>
                    <button 
                      onClick={() => updateDay(editingDay.day, { isWork: !editingDay.isWork })}
                      className={`w-full py-3 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-2 ${editingDay.isWork ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                    >
                      <Briefcase size={16} />
                      {editingDay.isWork ? 'Dzień Roboczy' : 'Dzień Wolny od Pracy'}
                    </button>
                  </div>

                  {/* Contact Toggle */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Typ Kontaktu</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button 
                        onClick={() => updateDay(editingDay.day, { 
                          contact: { type: 'osobiste', time: '18:00 - 20:00', status: 'pending' },
                          isFree: false
                        })}
                        className={`py-3 rounded-xl text-xs font-bold border-2 transition-all flex flex-col items-center gap-1 ${editingDay.contact?.type === 'osobiste' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                      >
                        <Heart size={16} />
                        Osobiste
                      </button>
                      <button 
                        onClick={() => updateDay(editingDay.day, { 
                          contact: { type: 'telefoniczne', time: '18:00 - 20:00', status: 'pending' },
                          isFree: false
                        })}
                        className={`py-3 rounded-xl text-xs font-bold border-2 transition-all flex flex-col items-center gap-1 ${editingDay.contact?.type === 'telefoniczne' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                      >
                        <Phone size={16} />
                        Telefon
                      </button>
                      <button 
                        onClick={() => updateDay(editingDay.day, { 
                          contact: undefined,
                          isFree: !editingDay.isWork && editingDay.appointments.length === 0
                        })}
                        className={`py-3 rounded-xl text-xs font-bold border-2 transition-all flex flex-col items-center gap-1 ${!editingDay.contact ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                      >
                        <Trash2 size={16} />
                        Brak
                      </button>
                    </div>
                  </div>

                  {/* Status Selection */}
                  {editingDay.contact && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status Realizacji</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => updateDay(editingDay.day, { 
                            contact: { ...editingDay.contact!, status: 'realized' }
                          })}
                          className={`py-3 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-2 ${editingDay.contact.status === 'realized' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                        >
                          <CheckCircle2 size={16} />
                          Zrealizowano
                        </button>
                        <button 
                          onClick={() => updateDay(editingDay.day, { 
                            contact: { ...editingDay.contact!, status: 'failed' }
                          })}
                          className={`py-3 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-2 ${editingDay.contact.status === 'failed' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                        >
                          <AlertCircle size={16} />
                          Brak
                        </button>
                        <button 
                          onClick={() => updateDay(editingDay.day, { 
                            contact: { ...editingDay.contact!, status: 'obstructed' }
                          })}
                          className={`py-3 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-2 ${editingDay.contact.status === 'obstructed' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                        >
                          <AlertCircle size={16} />
                          Utrudnianie
                        </button>
                        <button 
                          onClick={() => updateDay(editingDay.day, { 
                            contact: { ...editingDay.contact!, status: 'pending' }
                          })}
                          className={`py-3 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-2 ${editingDay.contact.status === 'pending' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                        >
                          <Clock size={16} />
                          Oczekuje
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Appointments */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Wizyty / Sprawy</label>
                    <div className="space-y-2">
                      {editingDay.appointments.map((app, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
                          <span className="text-xs font-bold text-gray-700">{app}</span>
                          <button 
                            onClick={() => {
                              const newApps = editingDay.appointments.filter((_, i) => i !== idx);
                              updateDay(editingDay.day, { appointments: newApps });
                            }}
                            className="text-rose-500 hover:bg-rose-50 p-1 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={newAppointment}
                          onChange={(e) => setNewAppointment(e.target.value)}
                          placeholder="Nowa wizyta..."
                          className="flex-grow bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button 
                          onClick={() => {
                            if (newAppointment.trim()) {
                              updateDay(editingDay.day, { appointments: [...editingDay.appointments, newAppointment.trim()] });
                              setNewAppointment('');
                            }
                          }}
                          className="bg-gray-900 text-white p-2 rounded-xl hover:bg-black transition-colors"
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Notatki / Powód</label>
                    <textarea 
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                      placeholder="Wpisz powód odrzucenia lub dodatkowe informacje..."
                      value={editingDay.contact?.note || ''}
                      onChange={(e) => updateDay(editingDay.day, { 
                        contact: editingDay.contact ? { ...editingDay.contact, note: e.target.value } : undefined 
                      })}
                    />
                  </div>

                  <button 
                    onClick={() => setEditingDay(null)}
                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Save size={18} />
                    Zapisz Zmiany
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-16 pb-12 text-center text-gray-400">
          <p className="text-xs font-bold uppercase tracking-widest">Chronogram Kontaktów {MONTH_NAMES[currentMonth]} {currentYear} • Wersja 2.1</p>
        </footer>
      </div>
    </div>
  );
}
