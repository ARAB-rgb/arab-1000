/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Plus, Search, User, Phone, MapPin, ClipboardList, Shield,
  Printer, Trash2, Edit2, FileText, CheckCircle, AlertTriangle, Eye, X, Globe
} from "lucide-react";
import { Installment, Project, User as AuthUser } from "../types";
import { getContractTiming, awExtractRegion, awCleanNotes, generateNextNo, awExtractTreasury, awExtractCapital, awExtractCapitalSource, awExtractCapitalCompany, awExtractCapitalCollection } from "../db";

interface InstallmentsProps {
  currentUser: AuthUser | null;
  installments: Installment[];
  projects: Project[];
  onSaveInstallment: (row: any, editId: string | null) => Promise<boolean>;
  onDeleteInstallment: (id: string) => void;
  onPrintContract: (id: string) => void;
  receipts: any[];
  searchPreset?: string;
  onClearSearchPreset?: () => void;
}

const getStoredTreasuries = (): string[] => {
  const defaults = ["خزنة الشركة", "خزنة التحصيل", "خزنة التحويل", "نقاط البيع"];
  const saved = localStorage.getItem("aw_treasuries");
  if (saved) {
    try {
      const arr = JSON.parse(saved);
      if (Array.isArray(arr) && arr.length > 0) {
        const merged = [...arr];
        defaults.forEach(d => {
          if (!merged.includes(d)) {
            merged.push(d);
          }
        });
        return merged;
      }
    } catch {}
  }
  return defaults;
};

export const Installments: React.FC<InstallmentsProps> = ({
  currentUser,
  installments,
  projects,
  onSaveInstallment,
  onDeleteInstallment,
  onPrintContract,
  receipts,
  searchPreset = "",
  onClearSearchPreset,
}) => {
  const [editId, setEditId] = useState<string | null>(null);

  // Form Fields
  const [client, setClient] = useState("");
  const [identity, setIdentity] = useState("");
  const [nationality, setNationality] = useState("");
  const [region, setRegion] = useState("");
  const [phone, setPhone] = useState("");
  const [contractNo, setContractNo] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [paid, setPaid] = useState<number | "">("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [periods, setPeriods] = useState<number | "">("");
  const [installment, setInstallment] = useState<number | "">("");
  const [discount, setDiscount] = useState<number | "">("");
  const [afterDiscount, setAfterDiscount] = useState<number | " text">("");
  const [projectSug, setProjectSug] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [guarantor, setGuarantor] = useState("");
  const [status, setStatus] = useState<"منتظم" | "متأخر" | "متعثر" | "مكتمل">("منتظم");
  const [notes, setNotes] = useState("");
  const [treasury, setTreasury] = useState("خزنة التحصيل");
  const [capital, setCapital] = useState<number | "">("");
  const [capitalSource, setCapitalSource] = useState<"شركة" | "تحصيل" | "كلاهما">("شركة");
  const [capitalCompany, setCapitalCompany] = useState<number | "">("");
  const [capitalCollection, setCapitalCollection] = useState<number | "">("");
  const [dynamicTreasuries, setDynamicTreasuries] = useState<string[]>(getStoredTreasuries);
  const [isCapitalManuallyEdited, setIsCapitalManuallyEdited] = useState(false);

  // Capital reactive sync / default computation
  useEffect(() => {
    if (editId || isCapitalManuallyEdited) return;
    
    // Auto populate capital based on amount and paid (The reactive feature)
    const calculatedCapital = Math.max(0, Number(amount || 0) - Number(paid || 0));
    if (calculatedCapital > 0) {
      if (capitalSource === "كلاهما") {
        setCapitalCompany(calculatedCapital * 0.5);
        setCapitalCollection(calculatedCapital * 0.5);
        setCapital("");
      } else {
        setCapital(calculatedCapital);
        setCapitalCompany("");
        setCapitalCollection("");
      }
    } else {
      setCapital("");
      setCapitalCompany("");
      setCapitalCollection("");
    }
  }, [amount, paid, capitalSource, editId, isCapitalManuallyEdited]);

  const handleCapitalSourceChange = (newSource: "شركة" | "تحصيل" | "كلاهما") => {
    setCapitalSource(newSource);
    
    // Convert / transfer existing values seamlessly
    if (newSource === "كلاهما") {
      const currentTotal = Number(capital || 0);
      if (currentTotal > 0) {
        setCapitalCompany(currentTotal * 0.5);
        setCapitalCollection(currentTotal * 0.5);
      }
      setCapital("");
    } else {
      const computedTotal = Number(capitalCompany || 0) + Number(capitalCollection || 0);
      if (computedTotal > 0) {
        setCapital(computedTotal);
      }
      setCapitalCompany("");
      setCapitalCollection("");
    }
  };

  const handleCapitalChange = (val: string) => {
    setCapital(val ? Number(val) : "");
    setIsCapitalManuallyEdited(true);
  };

  const handleCapitalCompanyChange = (val: string) => {
    setCapitalCompany(val ? Number(val) : "");
    setIsCapitalManuallyEdited(true);
  };

  const handleCapitalCollectionChange = (val: string) => {
    setCapitalCollection(val ? Number(val) : "");
    setIsCapitalManuallyEdited(true);
  };

  // Filters State
  const [qSearch, setQSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fNationality, setFNationality] = useState("");
  const [fProject, setFProject] = useState("");
  const [fRegion, setFRegion] = useState("");

  // Modal Detail State
  const [selectedFileContract, setSelectedFileContract] = useState<Installment | null>(null);

  useEffect(() => {
    if (searchPreset !== undefined) {
      setQSearch(searchPreset);
    }
  }, [searchPreset]);

  useEffect(() => {
    if (selectedFileContract) {
      const updated = installments.find((i) => i.id === selectedFileContract.id);
      if (updated) {
        setSelectedFileContract(updated);
      }
    }
  }, [installments]);

  // Auto computation triggers
  useEffect(() => {
    recalcLogic();
  }, [amount, paid, discount, periods, startDate]);

  useEffect(() => {
    // Fill custom auto sequence code on startup
    if (!contractNo) {
      setContractNo(generateNextNo("AW-CON", installments, "no"));
    }
  }, [installments, contractNo]);

  const recalcLogic = () => {
    const amt = Number(amount || 0);
    const pd = Number(paid || 0);
    const disc = Number(discount || 0);
    const days = Number(periods || 0);

    let calculatedEnd = "";
    if (days > 0 && startDate) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + days - 1);
      calculatedEnd = d.toISOString().slice(0, 10);
    }
    setEndDate(calculatedEnd);

    const remaining = Math.max(0, amt - pd);
    const instVal = days > 0 ? Math.ceil(remaining / days) : 0;
    const finalRem = Math.max(0, remaining - disc);

    setInstallment(instVal || "");
    setAfterDiscount(finalRem || "");
  };

  const handleClear = () => {
    setEditId(null);
    setClient("");
    setIdentity("");
    setNationality("");
    // Keep or enforce authorized region restriction
    if (currentUser && currentUser.role !== "admin" && currentUser.perms?.region) {
      setRegion(currentUser.perms.region);
    } else {
      setRegion("");
    }
    setPhone("");
    setContractNo(generateNextNo("AW-CON", installments, "no"));
    setAmount("");
    setPaid("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setPeriods("");
    setInstallment("");
    setDiscount("");
    setAfterDiscount("");
    setProjectSug("");
    setWorkplace("");
    setGuarantor("");
    setStatus("منتظم");
    setNotes("");
    setTreasury(getStoredTreasuries()[0] || "خزنة التحصيل");
    setCapital("");
    setCapitalSource("شركة");
    setCapitalCompany("");
    setCapitalCollection("");
    setIsCapitalManuallyEdited(false);
  };

  const handleEdit = (x: Installment) => {
    setEditId(x.id);
    setClient(x.client || "");
    setIdentity(x.identity || "");
    setNationality(x.nationality || "");
    setRegion(awExtractRegion(x.notes || "") || (currentUser?.perms?.region || ""));
    setPhone(x.phone || "");
    setContractNo(x.no || "");
    setAmount(x.amount || "");
    setPaid(x.paid || "");
    setStartDate(x.start_date || "");
    setPeriods(x.periods || "");
    setDiscount(x.discount || "");
    setProjectSug(x.project || "");
    setWorkplace(x.workplace || "");
    setGuarantor(x.guarantor || "");
    setStatus(x.status || "منتظم");
    setNotes(awCleanNotes(x.notes || ""));
    setTreasury(awExtractTreasury(x.notes || "") || getStoredTreasuries()[0] || "خزنة التحصيل");
    setCapital(awExtractCapital(x.notes || "") || "");
    setCapitalSource(awExtractCapitalSource(x.notes || ""));
    setCapitalCompany(awExtractCapitalCompany(x.notes || "") || "");
    setCapitalCollection(awExtractCapitalCollection(x.notes || "") || "");
    setIsCapitalManuallyEdited(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client.trim()) return;

    const row = {
      client: client.trim(),
      identity: identity.trim(),
      nationality,
      phone: phone.trim(),
      no: contractNo || generateNextNo("AW-CON", installments, "no"),
      amount: Number(amount || 0),
      paid: Number(paid || 0),
      remaining: Math.max(0, Number(amount || 0) - Number(paid || 0)),
      type: "daily",
      start_date: startDate,
      end_date: endDate,
      periods: Number(periods || 0),
      installment: Number(installment || 0),
      discount: Number(discount || 0),
      after_discount: Number(afterDiscount || 0),
      project: projectSug.trim(),
      workplace: workplace.trim(),
      guarantor: guarantor.trim(),
      status,
      notes: notes.trim(), // notes builder handling appended inside App.tsx
      region_input: region, // to be passed down
      treasury_input: treasury, // to be passed down
      capital_input: capitalSource === "كلاهما" ? (Number(capitalCompany || 0) + Number(capitalCollection || 0)) : Number(capital || 0),
      capital_source_input: capitalSource,
      capital_company_input: capitalSource === "كلاهما" ? Number(capitalCompany || 0) : (capitalSource === "شركة" ? Number(capital || 0) : 0),
      capital_collection_input: capitalSource === "كلاهما" ? Number(capitalCollection || 0) : (capitalSource === "تحصيل" ? Number(capital || 0) : 0)
    };

    const success = await onSaveInstallment(row, editId);
    if (success) {
      handleClear();
    }
  };

  // Safe checks for user permission context
  const allowedRegion = currentUser?.perms?.region || "";
  const filteredInstallments = installments.filter((item) => {
    const itemRegion = awExtractRegion(item.notes || "");
    if (currentUser && currentUser.role !== "admin" && allowedRegion) {
      return itemRegion === allowedRegion;
    }
    return true;
  });

  const getVisibleList = () => {
    return filteredInstallments.filter((x) => {
      const t = getContractTiming(x);
      const computedStatus = t.overdueDays > 0 ? "متأخر" : x.status;
      const r = awExtractRegion(x.notes || "");

      const txt = `${x.client} ${x.identity} ${x.phone} ${x.no} ${x.project} ${x.workplace} ${x.nationality} ${r}`.toLowerCase();

      return (
        (!qSearch || txt.includes(qSearch.toLowerCase().trim())) &&
        (!fStatus || computedStatus === fStatus) &&
        (!fNationality || x.nationality === fNationality) &&
        (!fProject || String(x.project).toLowerCase().includes(fProject.toLowerCase().trim())) &&
        (!fRegion || r === fRegion)
      );
    });
  };

  const listToRender = getVisibleList();

  // Selected file timing details & related receipts
  const activeTiming = selectedFileContract ? getContractTiming(selectedFileContract) : null;
  const activeReceipts = selectedFileContract
    ? receipts.filter((r) => r.installment_id === selectedFileContract.id || r.contract_no === selectedFileContract.no)
    : [];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Contract Addition Form Panel */}
      {((!editId && currentUser?.perms?.installmentsAdd) || (editId && currentUser?.perms?.installmentsEdit) || currentUser?.role === "admin") && (
        <form onSubmit={handleSubmit} className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="border-b border-slate-850 pb-4">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400">📝</span>
              {editId ? `تعديل عقد العميل — ${client}` : "إضافة عقد تقسيط يومي جديد"}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">اسم العميل</label>
              <div className="relative">
                <User className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  required
                  type="text"
                  placeholder="اسم العميل الرباعي"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">رقم الهوية / الإقامة</label>
              <div className="relative">
                <Shield className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  required
                  type="text"
                  placeholder="10 أرقام"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">جنسية العميل</label>
              <div className="relative">
                <Globe className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <select
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="">الجنسية</option>
                  <option value="سعودي">سعودي</option>
                  <option value="هندي">هندي</option>
                  <option value="باكستاني">باكستاني</option>
                  <option value="بنقالي">بنقالي</option>
                  <option value="مصري">مصري</option>
                  <option value="سوداني">سوداني</option>
                  <option value="يمني">يمني</option>
                  <option value="نيبالي">نيبالي</option>
                  <option value="فلبيني">فلبيني</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">إدارة الفرع</label>
              <select
                disabled={currentUser?.role !== "admin" && !!allowedRegion}
                value={region || (currentUser?.role !== "admin" ? allowedRegion : "")}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-75 disabled:cursor-not-allowed"
              >
                <option value="">الإدارة المسؤولة</option>
                <option value="الوسطى">الوسطى</option>
                <option value="الشرقية">الشرقية</option>
                <option value="الغربية">الغربية</option>
                <option value="الجنوب">الجنوب</option>
                <option value="الشمال">الشمال</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">رقم جوال العميل</label>
              <div className="relative">
                <Phone className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  required
                  type="text"
                  placeholder="05xxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">رقم العقد</label>
              <input
                readOnly
                type="text"
                value={contractNo}
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-850 rounded-xl text-xs font-bold text-slate-400 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">مبلغ العقد الكلي</label>
              <input
                required
                type="number"
                placeholder="المبلغ الإجمالي"
                value={amount}
                onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">الدفعة المدفوعة مقدماً</label>
              <input
                type="number"
                placeholder="الدفعة والمستلم"
                value={paid}
                onChange={(e) => setPaid(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">تاريخ البدء</label>
              <input
                required
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">عدد أيام العقد</label>
              <input
                required
                type="number"
                placeholder="مثال: 30 يوم"
                value={periods}
                onChange={(e) => setPeriods(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">القسط اليومي المستحق</label>
              <input
                readOnly
                type="text"
                placeholder="تلقائي بقسمة المتبقي"
                value={installment ? `${installment} ريال / يوم` : ""}
                className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-850 rounded-xl text-xs font-bold text-emerald-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">خصم انتظام السداد</label>
              <input
                type="number"
                placeholder="خصم تسوية"
                value={discount}
                onChange={(e) => setDiscount(e.target.value ? Number(e.target.value) : "")}
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">تاريخ الانتهاء</label>
              <input
                readOnly
                type="date"
                value={endDate}
                className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-850 rounded-xl text-xs font-bold text-slate-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">اسم المشروع المرتبط</label>
              <input
                type="text"
                list="projectsListForm"
                placeholder="ابحث وصنف المشروع"
                value={projectSug}
                onChange={(e) => setProjectSug(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500"
              />
              <datalist id="projectsListForm">
                {projects.map((p, idx) => (
                  <option key={idx} value={p.name} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">مقر العمل</label>
              <input
                type="text"
                placeholder="الجهة أو الشركة المشغلة"
                value={workplace}
                onChange={(e) => setWorkplace(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">الكفيل الغارم</label>
              <input
                type="text"
                placeholder="اسم الكفيل الضامن"
                value={guarantor}
                onChange={(e) => setGuarantor(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">حالة السداد العامة</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="منتظم">منتظم</option>
                <option value="متأخر">متأخر</option>
                <option value="متعثر">متعثر</option>
                <option value="مكتمل">مكتمل</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400">الخزنة المستهدفة بالمعاملات</label>
              <select
                value={treasury}
                onChange={(e) => setTreasury(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors"
              >
                {dynamicTreasuries.map((tName) => (
                  <option key={tName} value={tName} className="bg-slate-950 text-white">🏢 {tName}</option>
                ))}
              </select>
            </div>

             <div className="space-y-1">
              <label className="text-[10px] font-black text-amber-400">جهة تمويل رأس مال العقد</label>
              <select
                value={capitalSource}
                onChange={(e) => handleCapitalSourceChange(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500 transition-colors bg-slate-950 cursor-pointer"
              >
                <option value="شركة" className="bg-slate-950 text-white">💰 خزنة الشركة</option>
                <option value="تحصيل" className="bg-slate-950 text-white">💰 خزنة التحصيل</option>
                <option value="كلاهما" className="bg-slate-950 text-white">🤝 الاثنين معاً (تقسيم التمويل)</option>
              </select>
            </div>

            {capitalSource !== "كلاهما" ? (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-amber-400 flex items-center justify-between">
                  <span>قيمة رأس مال العقد (تمويل البداية)</span>
                  {isCapitalManuallyEdited && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCapitalManuallyEdited(false);
                      }}
                      className="text-[8px] text-blue-400 underline font-sans hover:text-blue-300"
                    >
                      (تفعيل تلقائي متبقي)
                    </button>
                  )}
                </label>
                <input
                  type="number"
                  placeholder="رأس المال المدفوع لتأسيس العقد"
                  value={capital}
                  onChange={(e) => handleCapitalChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-amber-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
                
                {/* Real-time interactive autofill helper badges */}
                {Number(amount || 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCapital(Number(amount || 0));
                        setIsCapitalManuallyEdited(true);
                      }}
                      className="text-[9px] px-2 py-0.5 bg-slate-950/60 text-slate-300 border border-slate-800 rounded hover:bg-slate-800 transition font-sans"
                    >
                      كامل العقد ({Number(amount).toLocaleString()})
                    </button>
                    {Number(paid || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setCapital(Math.max(0, Number(amount || 0) - Number(paid || 0)));
                          setIsCapitalManuallyEdited(true);
                        }}
                        className="text-[9px] px-2 py-0.5 bg-slate-950/60 text-amber-400 border border-slate-800 rounded hover:bg-slate-800 transition font-sans"
                      >
                        المتبقي ({Math.max(0, Number(amount || 0) - Number(paid || 0)).toLocaleString()})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCapital(Math.round(Number(amount || 0) * 0.7));
                        setIsCapitalManuallyEdited(true);
                      }}
                      className="text-[9px] px-2 py-0.5 bg-slate-950/60 text-slate-300 border border-slate-800 rounded hover:bg-slate-800 transition font-sans"
                    >
                      70٪ عصف ({Math.round(Number(amount || 0) * 0.7).toLocaleString()})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCapital(Math.round(Number(amount || 0) * 0.8));
                        setIsCapitalManuallyEdited(true);
                      }}
                      className="text-[9px] px-2 py-0.5 bg-slate-950/60 text-slate-300 border border-slate-800 rounded hover:bg-slate-800 transition font-sans"
                    >
                      80٪ عصف ({Math.round(Number(amount || 0) * 0.8).toLocaleString()})
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-amber-500/5 p-4 rounded-2xl border border-amber-500/20">
                <div className="space-y-1">
                  <span className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-amber-400">كم دفع الشركة من رأس المال؟</label>
                    <span className="text-[9px] text-slate-400 font-mono">
                      {Number(amount || 0) > 0 ? `${((Number(capitalCompany || 0) / (Number(amount || 0) - Number(paid || 0) || 1)) * 100).toFixed(0)}٪` : ""}
                    </span>
                  </span>
                  <input
                    type="number"
                    placeholder="تمويل من خزنة الشركة"
                    value={capitalCompany}
                    onChange={(e) => handleCapitalCompanyChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-amber-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <span className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-amber-400">كم دفع التحصيل من رأس المال؟</label>
                    <span className="text-[9px] text-slate-400 font-mono">
                      {Number(amount || 0) > 0 ? `${((Number(capitalCollection || 0) / (Number(amount || 0) - Number(paid || 0) || 1)) * 100).toFixed(0)}٪` : ""}
                    </span>
                  </span>
                  <input
                    type="number"
                    placeholder="تمويل من خزنة التحصيل"
                    value={capitalCollection}
                    onChange={(e) => handleCapitalCollectionChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-amber-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                {/* Live division ratio buttons */}
                <div className="sm:col-span-2 flex flex-col sm:flex-row gap-3 items-start sm:items-center border-t border-amber-500/10 pt-3 justify-between">
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const total = Math.max(0, Number(amount || 0) - Number(paid || 0)) || Number(amount || 0);
                        if (total > 0) {
                          setCapitalCompany(Math.round(total * 0.5));
                          setCapitalCollection(total - Math.round(total * 0.5));
                          setIsCapitalManuallyEdited(true);
                        }
                      }}
                      className="text-[9px] px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded hover:bg-amber-500/20 transition font-sans"
                    >
                      ⚖️ مناصفة 50/50
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const total = Math.max(0, Number(amount || 0) - Number(paid || 0)) || Number(amount || 0);
                        if (total > 0) {
                          setCapitalCompany(Math.round(total * 0.7));
                          setCapitalCollection(total - Math.round(total * 0.7));
                          setIsCapitalManuallyEdited(true);
                        }
                      }}
                      className="text-[9px] px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded hover:bg-amber-500/20 transition font-sans"
                    >
                      🏢 الشركة 70٪ / التحصيل 30٪
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const total = Math.max(0, Number(amount || 0) - Number(paid || 0)) || Number(amount || 0);
                        if (total > 0) {
                          setCapitalCompany(Math.round(total * 0.8));
                          setCapitalCollection(total - Math.round(total * 0.8));
                          setIsCapitalManuallyEdited(true);
                        }
                      }}
                      className="text-[9px] px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded hover:bg-amber-500/20 transition font-sans"
                    >
                      🏢 الشركة 80٪ / التحصيل 20٪
                    </button>
                    {isCapitalManuallyEdited && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCapitalManuallyEdited(false);
                        }}
                        className="text-[9px] px-2 py-0.5 bg-blue-600/10 text-blue-300 border border-blue-500/20 rounded hover:bg-blue-600/20 transition font-sans"
                      >
                        🔄 إعادة التفعيل التلقائي
                      </button>
                    )}
                  </div>

                  <span className="text-[11px] font-black text-amber-300">
                    💡 إجمالي رأس مال العقد المشترك: {((Number(capitalCompany || 0) + Number(capitalCollection || 0))).toLocaleString()} ريال
                  </span>
                </div>
              </div>
            )}

            <div className="sm:col-span-2 space-y-1">
              <label className="text-[10px] font-black text-slate-400">ملاحظات العقد</label>
              <textarea
                placeholder="تفاصيل إضافية أو شروط سداد"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 h-[46px] bg-slate-950/40 border border-slate-850 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleClear}
              className="px-5 py-2.5 rounded-xl text-xs font-black bg-slate-800 text-white hover:bg-slate-750 transition-all shadow-md"
            >
              إلغاء وتفريغ
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl text-xs font-black bg-amber-500 text-slate-950 hover:bg-amber-400 transition-all shadow-md"
            >
              {editId ? "حفظ التعديلات" : "حفظ وتسجيل العقد"}
            </button>
          </div>
        </form>
      )}

      {/* Filter and Tables Section */}
      <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        {/* Quick Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-slate-950/30 rounded-2xl border border-slate-850/80">
          <input
            type="text"
            placeholder="البحث باسم العميل أو العقد أو الجوال..."
            value={qSearch}
            onChange={(e) => setQSearch(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500"
          />
          <select
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-white focus:outline-none"
          >
            <option value="">جميع حالات السداد</option>
            <option value="منتظم">منتظم</option>
            <option value="متأخر">متأخر</option>
            <option value="متعثر">متعثر</option>
            <option value="مكتمل">مكتمل</option>
          </select>
          <select
            value={fNationality}
            onChange={(e) => setFNationality(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-white focus:outline-none"
          >
            <option value="">كل الجنسيات</option>
            <option value="سعودي">سعودي</option>
            <option value="هندي">هندي</option>
            <option value="باكستاني">باكستاني</option>
            <option value="بنقالي">بنقالي</option>
            <option value="مصري">مصري</option>
            <option value="سوداني">سوداني</option>
            <option value="يمني">يمني</option>
            <option value="أخرى">أخرى</option>
          </select>
          <input
            type="text"
            placeholder="المشروع المرتبط..."
            value={fProject}
            onChange={(e) => setFProject(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-blue-500"
          />
          <select
            value={fRegion}
            onChange={(e) => setFRegion(e.target.value)}
            disabled={currentUser?.role !== "admin" && !!allowedRegion}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-white focus:outline-none disabled:opacity-75"
          >
            <option value="">كل إدارات الفروع</option>
            <option value="الوسطى">الوسطى</option>
            <option value="الشرقية">الشرقية</option>
            <option value="الغربية">الغربية</option>
            <option value="الجنوب">الجنوب</option>
            <option value="الشمال">الشمال</option>
          </select>
        </div>

        {/* Contract log list table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-right text-xs md:text-sm">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-300">
                <th className="py-3 px-4 font-black">العميل والجنسية</th>
                <th className="py-3 px-4 font-black">رقم العقد والفرع</th>
                <th className="py-3 px-4 font-black">تاريخ العقد</th>
                <th className="py-3 px-4 font-black">آخر سداد</th>
                <th className="py-3 px-4 font-black text-center">التأخر</th>
                <th className="py-3 px-4 font-black">الإجمالي</th>
                <th className="py-3 px-4 font-black">المستلم</th>
                <th className="py-3 px-4 font-black">المتبقي</th>
                <th className="py-3 px-4 font-black">الحالة</th>
                <th className="py-3 px-4 font-black text-center">فتح الملف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/30">
              {listToRender.length > 0 ? (
                listToRender.map((item, idx) => {
                  const t = getContractTiming(item);
                  const computedStatus = t.overdueDays > 0 ? "متأخر" : item.status;
                  const itemRegion = awExtractRegion(item.notes || "");

                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-800/10 transition-colors ${
                        computedStatus === "متأخر" ? "bg-rose-950/5" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <span className="block font-black text-white">{item.client}</span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">{item.nationality || "غير محدد"}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <span className="block text-slate-200 font-bold">{item.no}</span>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <span className="block text-[10px] text-amber-500/80 font-sans font-bold">{itemRegion || "القرية الرئيسية"}</span>
                          <span className="block text-[9px] text-blue-400 font-sans font-black">🏢 {awExtractTreasury(item.notes || "") || "خزنة التحصيل"}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">{item.start_date}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">{t.lastPaid}</td>
                      <td className="py-3.5 px-4 text-center">
                        {t.overdueDays > 0 ? (
                          <span className="inline-block px-2.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 font-black font-mono">
                            {t.overdueDays} أيام
                          </span>
                        ) : (
                          <span className="text-slate-500 font-bold">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-white font-mono">{Number(item.amount || 0).toLocaleString()}</td>
                      <td className="py-3.5 px-4 font-bold text-emerald-400 font-mono">{Number(item.paid || 0).toLocaleString()}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-300 font-mono">{Number(item.remaining || 0).toLocaleString()}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                            computedStatus === "منتظم" || computedStatus === "مكتمل"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : computedStatus === "متأخر"
                              ? "bg-rose-500 text-white"
                              : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                          }`}
                        >
                          {computedStatus}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => setSelectedFileContract(item)}
                          className="px-3 py-1.5 bg-slate-950/40 border border-slate-800 text-xs font-bold text-blue-400 hover:text-white rounded-lg hover:bg-blue-600/25 transition-all"
                        >
                          فتح الملف
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500 font-bold">
                    لا توجد أي عقود مسجلة ومطابقة للتصنيفات.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contract File Details Sheet Modal overlay */}
      {selectedFileContract && activeTiming && (
        <div className="fixed inset-0 z-[999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl flex flex-col">
            
            {/* Modal Header */}
            <div className="sticky top-0 bg-slate-900 px-6 py-5 border-b border-slate-800 flex justify-between items-center z-10">
              <div>
                <h4 className="text-lg font-black text-white flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400">📂</span>
                  ملف العقد — {selectedFileContract.no}
                </h4>
                <p className="text-xs text-slate-400 font-bold mt-1">عرض عام لمستندات العميل وتحركات الدفوعات التابعة</p>
              </div>
              <button
                onClick={() => setSelectedFileContract(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white transition-colors"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              
              {/* Profile details grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">العميل</span>
                  <span className="font-bold text-white text-sm">{selectedFileContract.client}</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">رقم الهوية</span>
                  <span className="font-mono text-white font-bold text-xs">{selectedFileContract.identity}</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">الجوال</span>
                  <span className="font-mono text-white font-bold text-xs">{selectedFileContract.phone}</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">الجنسية</span>
                  <span className="font-bold text-white text-xs">{selectedFileContract.nationality || "سعودي"}</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">مبلغ العقد الكلي</span>
                  <span className="font-mono text-white font-black text-sm">{Number(selectedFileContract.amount).toLocaleString()} ريال</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">المدفوع مقدماً</span>
                  <span className="font-mono text-emerald-400 font-extrabold text-xs">{Number(selectedFileContract.paid).toLocaleString()} ريال</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850 bg-amber-500/5">
                  <span className="block text-[10px] font-black text-amber-400 mb-1">رأس مال العقد</span>
                  <span className="font-mono text-amber-200 font-extrabold text-sm block">
                    {Number(awExtractCapital(selectedFileContract.notes || "")).toLocaleString()} ريال
                  </span>
                  {(() => {
                    const src = awExtractCapitalSource(selectedFileContract.notes || "");
                    const comp = awExtractCapitalCompany(selectedFileContract.notes || "");
                    const coll = awExtractCapitalCollection(selectedFileContract.notes || "");
                    
                    if (src === "كلاهما") {
                      return (
                        <span className="block text-[9px] text-amber-300/80 mt-1 leading-normal font-sans">
                          (الشركة: {comp.toLocaleString()} | التحصيل: {coll.toLocaleString()})
                        </span>
                      );
                    } else if (src === "شركة") {
                      return (
                        <span className="block text-[9px] text-amber-300/80 mt-1 leading-normal font-sans">
                          (الممول: خزنة الشركة)
                        </span>
                      );
                    } else {
                      return (
                        <span className="block text-[9px] text-amber-300/80 mt-1 leading-normal font-sans">
                          (الممول: خزنة التحصيل)
                        </span>
                      );
                    }
                  })()}
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">المتبقي الكلي</span>
                  <span className="font-mono text-rose-400 font-extrabold text-sm">{Number(selectedFileContract.remaining).toLocaleString()} ريال</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">القسط اليومي</span>
                  <span className="font-mono text-amber-500 font-extrabold text-xs">{Number(selectedFileContract.installment).toLocaleString()} ريال / يوم</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">تاريخ البدء والانتهاء</span>
                  <span className="font-mono text-white text-[11px] font-bold">{selectedFileContract.start_date} ← {selectedFileContract.end_date || "مستمر"}</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">آخر سداد مدفوع</span>
                  <span className="font-mono text-white font-bold text-xs">{activeTiming.lastPaid}</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">أيام ومبالغ التأخير اليوم</span>
                  <span className="font-bold text-rose-400 text-xs">{activeTiming.overdueDays} يوم | {activeTiming.overdueAmount.toLocaleString()} ريال</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">المشروع المرتبط</span>
                  <span className="font-bold text-amber-500 text-xs">{selectedFileContract.project || "غير مرتبط بمشروع"}</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">مقر العمل والكفيل</span>
                  <span className="font-bold text-white text-[11px] leading-relaxed">
                    مقر: {selectedFileContract.workplace || "لا يوجد"}<br />
                    كفيل: {selectedFileContract.guarantor || "لا يوجد"}
                  </span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850 col-span-2">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">ملاحظات وشهادات الفرع</span>
                  <span className="font-bold text-slate-350 text-xs">{awCleanNotes(selectedFileContract.notes || "") || "لا يوجد ملاحظات إدارية"}</span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850 text-center">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">تفريغ الفرع</span>
                  <span className="inline-block px-3 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-extrabold text-xs">
                    {awExtractRegion(selectedFileContract.notes || "") || "غير مصنف"}
                  </span>
                </div>
                <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-850 text-center flex flex-col items-center justify-center">
                  <span className="block text-[10px] font-bold text-slate-400 mb-1">الخزنة النشطة</span>
                  <select
                    value={awExtractTreasury(selectedFileContract.notes || "") || "خزنة التحصيل"}
                    onChange={async (e) => {
                      const newTreasury = e.target.value;
                      const activeRegion = awExtractRegion(selectedFileContract.notes || "") || "";
                      const activeCap = awExtractCapital(selectedFileContract.notes || "");
                      const activeCapSource = awExtractCapitalSource(selectedFileContract.notes || "");
                      const activeCapCompany = awExtractCapitalCompany(selectedFileContract.notes || "");
                      const activeCapCollection = awExtractCapitalCollection(selectedFileContract.notes || "");
                      const row = {
                        client: selectedFileContract.client,
                        identity: selectedFileContract.identity,
                        nationality: selectedFileContract.nationality || "",
                        phone: selectedFileContract.phone,
                        no: selectedFileContract.no,
                        amount: Number(selectedFileContract.amount || 0),
                        paid: Number(selectedFileContract.paid || 0),
                        remaining: Number(selectedFileContract.remaining || 0),
                        type: "daily",
                        start_date: selectedFileContract.start_date,
                        end_date: selectedFileContract.end_date,
                        periods: Number(selectedFileContract.periods || 0),
                        installment: Number(selectedFileContract.installment || 0),
                        discount: Number(selectedFileContract.discount || 0),
                        after_discount: Number(selectedFileContract.after_discount || 0),
                        project: selectedFileContract.project,
                        workplace: selectedFileContract.workplace,
                        guarantor: selectedFileContract.guarantor,
                        status: selectedFileContract.status,
                        notes: awCleanNotes(selectedFileContract.notes || ""),
                        region_input: activeRegion,
                        treasury_input: newTreasury,
                        capital_input: activeCap,
                        capital_source_input: activeCapSource,
                        capital_company_input: activeCapCompany,
                        capital_collection_input: activeCapCollection
                      };
                      await onSaveInstallment(row, selectedFileContract.id);
                    }}
                    className="mt-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-extrabold text-xs rounded-xl px-2.5 py-1.5 text-center focus:outline-none cursor-pointer max-w-full transition-colors"
                  >
                    {dynamicTreasuries.map((tName) => (
                      <option key={tName} value={tName} className="bg-slate-950 text-white">💰 {tName}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Related collections receipts section */}
              <div className="space-y-3">
                <h5 className="text-sm font-black text-slate-300 border-b border-slate-850 pb-2">💰 سندات المقبوضات المسجلة للعقد</h5>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-400">
                        <th className="py-2.5 px-3 font-bold">رقم السند</th>
                        <th className="py-2.5 px-3 font-bold">تاريخ الدفعة</th>
                        <th className="py-2.5 px-3 font-bold">البيان</th>
                        <th className="py-2.5 px-3 font-bold">المستلم من</th>
                        <th className="py-2.5 px-3 font-bold">طريقة الدفع</th>
                        <th className="py-2.5 px-3 font-bold">المبلغ المدفوع</th>
                        <th className="py-2.5 px-3 font-bold">المتبقي الكلي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850/30">
                      {activeReceipts.length > 0 ? (
                        activeReceipts.map((rec, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-800/10">
                            <td className="py-2 px-3 font-mono text-slate-300 font-bold">{rec.no}</td>
                            <td className="py-2 px-3 font-mono text-slate-400">{rec.date}</td>
                            <td className="py-2 px-3 text-slate-300">{rec.notes || "قبض دفعة قسط يومي"}</td>
                            <td className="py-2 px-3 font-bold">{rec.from_name}</td>
                            <td className="py-2 px-3 text-slate-400">{rec.method}</td>
                            <td className="py-2 px-3 font-black text-emerald-400 font-mono">+{Number(rec.amount || 0).toLocaleString()} ريال</td>
                            <td className="py-2 px-3 font-black text-slate-300 font-mono">{Number(rec.remaining_after || 0).toLocaleString()} ريال</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-500 font-bold">
                            لا توجد أي سندات مقبوضات على العقد الحالي حالياً.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Modal Actions */}
            <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-4 shrink-0 flex justify-end gap-3 z-10">
              {currentUser?.perms?.installmentsDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("تأكيد حذف العقد بشكل نهائي؟ لا يمكن التراجع!")) {
                      onDeleteInstallment(selectedFileContract.id);
                      setSelectedFileContract(null);
                    }
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl flex items-center gap-1 shadow transition-all mr-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  حذف العقد
                </button>
              )}
              
              {((currentUser?.perms?.installmentsEdit) || currentUser?.role === "admin") && (
                <button
                  type="button"
                  onClick={() => {
                    handleEdit(selectedFileContract);
                    setSelectedFileContract(null);
                  }}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl flex items-center gap-1 shadow transition-all"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  تعديل الملف
                </button>
              )}

              <button
                type="button"
                onClick={() => onPrintContract(selectedFileContract.id)}
                className="px-5 py-2 bg-amber-500 text-slate-950 hover:bg-amber-400 font-black text-xs rounded-xl flex items-center gap-1 shadow transition-all"
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة العقد
              </button>
              
              <button
                type="button"
                onClick={() => setSelectedFileContract(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-750 text-white font-black text-xs rounded-xl"
              >
                إغلاق النافذة
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
