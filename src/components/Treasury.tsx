/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Wallet, Landmark, TrendingUp, Search, Plus, Trash2, AlertTriangle, Coins, Printer, X } from "lucide-react";
import { Receipt, Payment, Expense, Installment } from "../types";
import { awExtractTreasury, awExtractCapital, awExtractCapitalSource, awExtractCapitalCompany, awExtractCapitalCollection } from "../db";

interface TreasuryProps {
  receipts: Receipt[];
  payments: Payment[];
  expenses: Expense[];
  installments: Installment[];
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
  // Contracting Treasury is removed by default here, but the user can add it dynamically
  return defaults;
};

export const Treasury: React.FC<TreasuryProps> = ({ receipts, payments, expenses, installments }) => {
  const [treasuries, setTreasuries] = useState<string[]>(getStoredTreasuries);
  const [activeTab, setActiveTab] = useState<string>(() => {
    const list = getStoredTreasuries();
    return list[0] || "خزنة الشركة";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [newTreasuryName, setNewTreasuryName] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Print Account Statement States
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printScope, setPrintScope] = useState<"all" | "filtered">("filtered");

  const handlePrint = () => {
    const style = document.createElement("style");
    style.id = "print-temporary-styles";
    style.innerHTML = `
      @media print {
        body > * {
          display: none !important;
        }
        #custom-print-section {
          display: block !important;
          direction: rtl !important;
          background: white !important;
          color: black !important;
        }
      }
    `;
    document.head.appendChild(style);
    window.print();
    const elem = document.getElementById("print-temporary-styles");
    if (elem) elem.remove();
  };

  useEffect(() => {
    // Reload if storage changes in other windows
    const handleStorageChange = () => {
      const freshList = getStoredTreasuries();
      setTreasuries(freshList);
      if (!freshList.includes(activeTab)) {
        setActiveTab(freshList[0] || "خزنة الشركة");
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [activeTab]);

  // Handle adding a treasury
  const handleAddTreasury = (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError(null);
    const name = newTreasuryName.trim();
    if (!name) return;
    if (treasuries.includes(name)) {
      setInlineError("⚠️ هذه الخزنة مسجلة مسبقاً في النظام!");
      return;
    }
    const updated = [...treasuries, name];
    setTreasuries(updated);
    localStorage.setItem("aw_treasuries", JSON.stringify(updated));
    setNewTreasuryName("");
    // Dispatch to keep Installments synced
    window.dispatchEvent(new Event("storage"));
  };

  // Handle deleting a treasury
  const handleDeleteTreasury = (name: string) => {
    setInlineError(null);
    if (treasuries.length <= 1) {
      setInlineError("⚠️ يجب إبقاء خزنة واحدة على الأقل في النظام لتسجيل المعاملات المالية!");
      return;
    }
    
    // Check if there are active transactions associated with it
    const txCount = getCompiledTransactionsForSafe(name).length;
    let confirmMsg = `هل أنت متأكد من إلغاء وحذف (${name}) نهائياً؟`;
    if (txCount > 0) {
      confirmMsg += `\nتنبيه: تحتوي هذه الخزنة على عدد ${txCount} معاملات نشطة بالدفتر! قد يؤثر حذفها على الترصيد الحسابي.`;
    }

    if (window.confirm(confirmMsg)) {
      const updated = treasuries.filter(t => t !== name);
      setTreasuries(updated);
      localStorage.setItem("aw_treasuries", JSON.stringify(updated));
      if (activeTab === name) {
        setActiveTab(updated[0] || "خزنة الشركة");
      }
      window.dispatchEvent(new Event("storage"));
    }
  };

  // Helper to resolve safe/treasury for any receipt
  const getReceiptTreasury = (r: Receipt): string => {
    const rDirect = awExtractTreasury(r.notes || "");
    if (rDirect) return rDirect;
    const linked = installments.find(inst => inst.id === r.installment_id || inst.no === r.contract_no);
    if (linked) {
      return awExtractTreasury(linked.notes || "") || "خزنة التحصيل";
    }
    return "خزنة التحصيل";
  };

  // Helper for payments
  const getPaymentTreasury = (p: Payment): string => {
    return awExtractTreasury(p.notes || "") || "خزنة الشركة";
  };

  // Helper for expenses
  const getExpenseTreasury = (e: Expense): string => {
    return awExtractTreasury(e.notes || "") || "خزنة الشركة";
  };

  // Calculations per Safe dynamically calculated
  const safeStats = treasuries.map(t => {
    const receiptsOfSafe = receipts.filter(r => getReceiptTreasury(r) === t);
    const paymentsOfSafe = payments.filter(p => getPaymentTreasury(p) === t);
    const expensesOfSafe = expenses.filter(e => getExpenseTreasury(e) === t);
    
    // Capital outflows for contracts belonging to this safe or funded specifically from it
    let capitalOut = 0;
    installments.forEach(x => {
      const source = awExtractCapitalSource(x.notes || "");
      const companyAmount = awExtractCapitalCompany(x.notes || "");
      const collectionAmount = awExtractCapitalCollection(x.notes || "");
      const totalCap = awExtractCapital(x.notes || "");
      
      if (t === "خزنة الشركة") {
        if (source === "شركة") {
          capitalOut += totalCap;
        } else if (source === "كلاهما") {
          capitalOut += companyAmount;
        }
      } else if (t === "خزنة التحصيل") {
        if (source === "تحصيل") {
          capitalOut += totalCap;
        } else if (source === "كلاهما") {
          capitalOut += collectionAmount;
        }
      } else {
        const contractTreasury = awExtractTreasury(x.notes || "") || "خزنة التحصيل";
        if (contractTreasury === t) {
          if (source !== "شركة" && source !== "تحصيل" && source !== "كلاهما") {
            capitalOut += totalCap;
          }
        }
      }
    });
    
    const inbound = receiptsOfSafe.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const paymentsOut = paymentsOfSafe.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const expensesOut = expensesOfSafe.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    
    const outbound = paymentsOut + expensesOut + capitalOut;
    const balance = inbound - outbound;
    
    return {
      name: t,
      inbound,
      outbound,
      balance,
      paymentsOut,
      expensesOut,
      capitalOut
    };
  });

  // Calculate transactions for a specific safe
  const getCompiledTransactionsForSafe = (safeName: string) => {
    let items: {
      date: string;
      type: "قبض" | "صرف" | "مصروف" | "رأس مال";
      desc: string;
      inbound: number;
      outbound: number;
      sourceTreasury: string;
    }[] = [];

    receipts.forEach((r) => {
      if (getReceiptTreasury(r) === safeName) {
        items.push({
          date: r.date || "",
          type: "قبض",
          desc: r.from_name ? `${r.from_name} — سند قبض لعقد ${r.contract_no || ""}` : `دفعة عقد ${r.contract_no || ""}`,
          inbound: Number(r.amount || 0),
          outbound: 0,
          sourceTreasury: safeName
        });
      }
    });

    payments.forEach((p) => {
      if (getPaymentTreasury(p) === safeName) {
        items.push({
          date: p.date || "",
          type: "صرف",
          desc: p.to_name ? `سند صرف إلى: ${p.to_name} — مبرر: ${p.notes || "مسجل في الخصم"}` : "سند صرف مالي",
          inbound: 0,
          outbound: Number(p.amount || 0),
          sourceTreasury: safeName
        });
      }
    });

    expenses.forEach((e) => {
      if (getExpenseTreasury(e) === safeName) {
        items.push({
          date: e.date || "",
          type: "مصروف",
          desc: `${e.name || "مصروف"} [${e.category || "عام"}] — المورد: ${e.supplier || "غير مسجل"}`,
          inbound: 0,
          outbound: Number(e.amount || 0),
          sourceTreasury: safeName
        });
      }
    });

    // Add capitals of contracts as outbound flows
    installments.forEach((x) => {
      const source = awExtractCapitalSource(x.notes || "");
      const companyAmount = awExtractCapitalCompany(x.notes || "");
      const collectionAmount = awExtractCapitalCollection(x.notes || "");
      const totalCap = awExtractCapital(x.notes || "");

      let applicableCapOutflow = 0;
      let descSuffix = "";

      if (safeName === "خزنة الشركة") {
        if (source === "شركة") {
          applicableCapOutflow = totalCap;
          descSuffix = " [كامل التمويل من الشركة]";
        } else if (source === "كلاهما" && companyAmount > 0) {
          applicableCapOutflow = companyAmount;
          descSuffix = ` [مساهمة الشركة: ${companyAmount.toLocaleString()} ريال]`;
        }
      } else if (safeName === "خزنة التحصيل") {
        if (source === "تحصيل") {
          applicableCapOutflow = totalCap;
          descSuffix = " [كامل التمويل من التحصيل]";
        } else if (source === "كلاهما" && collectionAmount > 0) {
          applicableCapOutflow = collectionAmount;
          descSuffix = ` [مساهمة التحصيل: ${collectionAmount.toLocaleString()} ريال]`;
        }
      } else {
        const contractTreasury = awExtractTreasury(x.notes || "") || "خزنة التحصيل";
        if (contractTreasury === safeName) {
          if (source !== "شركة" && source !== "تحصيل" && source !== "كلاهما") {
            applicableCapOutflow = totalCap;
          }
        }
      }

      if (applicableCapOutflow > 0) {
        items.push({
          date: x.start_date || "",
          type: "رأس مال",
          desc: `تأسيس رأس مال العقد رقم: ${x.no} — العميل: ${x.client}${descSuffix}`,
          inbound: 0,
          outbound: applicableCapOutflow,
          sourceTreasury: safeName
        });
      }
    });

    // Sort ascending to compute chronological running balances
    items.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    let running = 0;
    const itemsWithBalance = items.map((item) => {
      running += (item.inbound - item.outbound);
      return { ...item, balance: running };
    });

    itemsWithBalance.reverse();
    return itemsWithBalance;
  };

  // Compile transactions for active selected safe
  const getFilteredTransactions = () => {
    const rawTxs = getCompiledTransactionsForSafe(activeTab);

    // Filter by search query
    return rawTxs.filter((tx) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        tx.date.includes(q) ||
        tx.type.includes(q) ||
        tx.desc.toLowerCase().includes(q) ||
        String(tx.inbound).includes(q) ||
        String(tx.outbound).includes(q)
      );
    });
  };

  const filteredTxs = getFilteredTransactions();

  return (
    <div className="space-y-8" dir="rtl">
      
      {/* Dynamic Main Premium Glass Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {safeStats.map((stat, idx) => {
          // cyclic styling for dynamic cards based on indices
          const styles = [
            { border: "border-blue-500/30 hover:border-blue-500/50", glow: "bg-blue-500/10", text: "text-blue-300", icon: "text-blue-400" },
            { border: "border-emerald-500/30 hover:border-emerald-500/50", glow: "bg-emerald-500/10", text: "text-emerald-300", icon: "text-emerald-400" },
            { border: "border-amber-500/30 hover:border-amber-500/50", glow: "bg-amber-500/10", text: "text-amber-300", icon: "text-amber-400" },
            { border: "border-purple-500/30 hover:border-purple-500/50", glow: "bg-purple-500/10", text: "text-purple-300", icon: "text-purple-400" },
            { border: "border-rose-500/30 hover:border-rose-500/50", glow: "bg-rose-500/10", text: "text-rose-300", icon: "text-rose-400" }
          ];
          const st = styles[idx % styles.length];

          return (
            <div key={stat.name} className={`relative overflow-hidden rounded-3xl p-6 bg-slate-900/60 backdrop-blur-xl border ${st.border} shadow-xl transition-all duration-300 flex flex-col justify-between`}>
              <div className={`absolute top-0 right-0 w-32 h-32 ${st.glow} rounded-full blur-3xl -mr-10 -mt-10`} />
              
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className={`text-xs md:text-sm font-black tracking-wide flex items-center gap-1.5 ${st.text}`}>
                    <Landmark className="w-4 h-4 text-blue-400" /> {stat.name}
                  </span>
                </div>
                <div className="space-y-1">
                  <h2 className="text-3xl font-black text-white font-mono">
                    {stat.balance.toLocaleString()} <span className="text-xs font-normal font-sans text-slate-400">ريال</span>
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400">الرصيد النشط الفعلي بالدفتر</p>
                </div>
              </div>

              {/* Inflows vs Contract Capital Outflows breakdown */}
              <div className="mt-5 space-y-1.5 text-[11px] bg-slate-950/40 border border-slate-850/80 p-3 rounded-2xl">
                {stat.capitalOut > 0 && (
                  <div className="flex justify-between items-center text-amber-200">
                    <span>رؤوس أموال عقود ممولة:</span>
                    <span className="font-mono font-bold">-{stat.capitalOut.toLocaleString()} ريال</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-slate-400">
                  <span>وارد متحصل وعقود تقسيط:</span>
                  <span className="font-mono text-emerald-400 font-bold">+{stat.inbound.toLocaleString()} ريال</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>سندات صرف ومصاريف أخرى:</span>
                  <span className="font-mono text-rose-400 font-bold">-{(stat.outbound - stat.capitalOut).toLocaleString()} ريال</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-between gap-2 text-xs">
                <div className="flex-1 bg-slate-950/20 rounded-xl p-2 text-center border border-slate-850/50">
                  <span className="block text-slate-400 text-[10px] font-semibold mb-1">إجمالي الوارد</span>
                  <b className="text-emerald-400 font-black pr-0.5 font-mono">{stat.inbound.toLocaleString()}</b>
                </div>
                <div className="flex-1 bg-slate-950/20 rounded-xl p-2 text-center border border-slate-850/50">
                  <span className="block text-slate-400 text-[10px] font-semibold mb-1">إجمالي الصادر</span>
                  <b className="text-rose-400 font-black pr-0.5 font-mono">{stat.outbound.toLocaleString()}</b>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs and Filters Box */}
      <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between shadow-lg">
        {/* Dynamic tabs list */}
        <div className="flex bg-slate-900/90 p-1.5 rounded-xl border border-slate-850 w-full md:w-auto flex-wrap gap-1">
          {treasuries.map((tName, idx) => {
            const isActive = activeTab === tName;
            const colorClasses = [
              "bg-blue-600 text-white shadow-lg shadow-blue-500/20",
              "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20",
              "bg-amber-600 text-slate-950 font-black shadow-lg shadow-amber-500/20",
              "bg-purple-600 text-white shadow-lg shadow-purple-500/20",
              "bg-rose-600 text-white shadow-lg shadow-rose-500/20"
            ];
            const activeColor = colorClasses[idx % colorClasses.length];

            return (
              <button
                key={tName}
                onClick={() => setActiveTab(tName)}
                className={`flex-grow md:flex-grow-0 px-5 py-2 rounded-lg text-xs md:text-sm font-extrabold select-none transition-all duration-200 ${
                  isActive
                    ? activeColor
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                💼 {tName}
              </button>
            );
          })}
        </div>

        {/* Query & Print Box */}
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
          <div className="relative w-full sm:w-64">
            <Search className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="بحث في قيود الخزنة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-10 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs font-bold text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <button
            onClick={() => setIsPrintModalOpen(true)}
            className="px-5 py-2.5 shrink-0 rounded-xl bg-gradient-to-l from-amber-500 via-amber-600 to-yellow-500 text-slate-950 font-black text-xs hover:from-amber-450 hover:to-amber-550 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(245,158,11,0.2)] cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-950" />
            <span>طباعة كشف الحساب</span>
          </button>
        </div>
      </div>

      {/* Transaction Records Table */}
      <div className="space-y-2">
        <h3 className="text-sm font-black text-slate-200 flex items-center gap-2">
          📊 كشف حركة حساب الخزنة الحالية ({activeTab})
        </h3>
        <div className="overflow-x-auto bg-slate-900/40 border border-slate-800 rounded-2xl shadow-xl">
          <table className="w-full text-right border-collapse text-xs md:text-sm">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800">
                <th className="py-4 px-4 font-black text-slate-300">التاريخ</th>
                <th className="py-4 px-4 font-black text-slate-300">النوع</th>
                <th className="py-4 px-4 font-black text-slate-300">البيان الشروحات</th>
                <th className="py-4 px-4 font-black text-slate-300">وارد (قبض)</th>
                <th className="py-4 px-4 font-black text-slate-300">صادر (صرف / تمويل)</th>
                <th className="py-4 px-4 font-black text-slate-300">الرصيد المتراكم</th>
              </tr>
            </thead>
            <tbody>
              {filteredTxs.length > 0 ? (
                filteredTxs.map((tx, idx) => {
                  let badgeClass = "";
                  if (tx.type === "قبض") badgeClass = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                  if (tx.type === "صرف") badgeClass = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
                  if (tx.type === "مصروف") badgeClass = "bg-rose-500/10 text-rose-400 border border-rose-500/20";
                  if (tx.type === "رأس مال") badgeClass = "bg-purple-500/10 text-purple-400 border border-purple-500/20";

                  return (
                    <tr
                      key={idx}
                      className="border-b border-slate-850/50 hover:bg-slate-800/10 transition-colors placeholder:text-slate-500"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-300">{tx.date}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-[10px] md:text-xs font-black ${badgeClass}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-200 font-bold max-w-xs truncate" title={tx.desc}>
                        {tx.desc}
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-emerald-400 font-mono">
                        {tx.inbound > 0 ? `+${tx.inbound.toLocaleString()}` : "—"}
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-rose-400 font-mono">
                        {tx.outbound > 0 ? `-${tx.outbound.toLocaleString()}` : "—"}
                      </td>
                      <td className="py-3.5 px-4 font-black text-slate-100 font-mono">
                        {tx.balance.toLocaleString()} ريال
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 font-bold">
                    لا توجد حركات حسابية أو قيود مسجلة في هذه الخزنة بعد تلبي شروط كشف الحساب.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dynamic Treasury Management section */}
      <div className="bg-slate-900/60 rounded-3xl border border-slate-800 p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-850 pb-4">
          <div>
            <h4 className="text-md font-black text-white flex items-center gap-2">
              🛠️ لوحة إدارة وهيكلة خزائن المنظومة النشطة
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              يمكنك إضافة خزائن وصناديق مالية فرعية جديدة أو حذف الخزائن غير المستخدمة لجعل سياقات المحاسبة ديناميكية بالكامل.
            </p>
          </div>
        </div>

        {inlineError && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-bold leading-relaxed flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {inlineError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form to add */}
          <form onSubmit={handleAddTreasury} className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-300">تسجيل خزنة مالية جديدة</label>
              <input
                type="text"
                placeholder="مثال: خزنة الرياض، خزنة النقد الاحتياطي..."
                value={newTreasuryName}
                onChange={(e) => {
                  setNewTreasuryName(e.target.value);
                  setInlineError(null);
                }}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-all shadow-md flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> إضافة الخزنة المقترحة للقائمة
            </button>
          </form>

          {/* List and delete */}
          <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl space-y-4">
            <span className="block text-xs font-black text-slate-300">الخزائن المعرفة بالبرنامج حالياً</span>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {treasuries.map((name) => {
                const txCount = getCompiledTransactionsForSafe(name).length;
                return (
                  <div key={name} className="flex justify-between items-center bg-slate-900/50 p-2.5 rounded-xl border border-slate-850">
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-emerald-400" />
                      <div>
                        <span className="text-xs font-black text-white">{name}</span>
                        <span className="block text-[9px] text-slate-500">تحتوي على عدد {txCount} قيد بالدفتر</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteTreasury(name)}
                      className="p-1 px-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-rose-400 hover:text-rose-300 text-[10px] font-semibold transition-all flex items-center gap-1"
                      title="حذف وإلغاء هذه الخزنة من القائمة"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> إلغاء
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Print Preview Modal */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-amber-500/20 rounded-[28px] w-full max-w-4xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col my-8">
            {/* Modal Header */}
            <div className="bg-slate-950/80 border-b border-slate-800 p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="text-amber-500 w-5 h-5 animate-pulse" />
                <h3 className="text-sm md:text-base font-black text-white">
                  معاينة كشف حساب الخزنة قبل الطباعة
                </h3>
              </div>
              <button
                onClick={() => setIsPrintModalOpen(false)}
                className="p-1 px-3 bg-slate-850 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white text-xs transition-all flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>إغلاق المعاينة</span>
              </button>
            </div>

            {/* Print Scope Controls */}
            <div className="bg-slate-950/30 p-4 border-b border-slate-800/80 flex flex-col sm:flex-row gap-4 justify-between items-center text-xs">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <span className="font-bold text-slate-400">نطاق التقرير الحسابي: </span>
                <div className="flex gap-2 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setPrintScope("filtered")}
                    className={`px-3.5 py-1.5 rounded-lg font-black transition-all cursor-pointer ${
                      printScope === "filtered"
                        ? "bg-amber-500 text-slate-950 shadow-md"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    العمليات المفلترة بالحالة والمصطلح ({filteredTxs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintScope("all")}
                    className={`px-3.5 py-1.5 rounded-lg font-black transition-all cursor-pointer ${
                      printScope === "all"
                        ? "bg-amber-500 text-slate-950 shadow-md"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    جميع القيود الحالية بالخزنة ({getCompiledTransactionsForSafe(activeTab).length})
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePrint}
                className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-l from-amber-500 via-amber-600 to-yellow-500 text-slate-950 font-black rounded-xl hover:from-amber-400 hover:to-amber-500 transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-amber-500/25 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
              >
                <Printer className="w-4.5 h-4.5 text-slate-950" />
                <span>تأكيد وطباعة الكشف الفعلي</span>
              </button>
            </div>

            {/* Simulated Live Sheet Document Preview Wrapper */}
            <div className="p-6 bg-slate-950/45 overflow-y-auto max-h-[500px] flex justify-center selection:bg-amber-500/30">
              <div className="w-full max-w-[800px] bg-white text-slate-950 p-8 rounded-2xl shadow-inner border border-slate-200 text-right leading-relaxed font-sans select-text">
                <div className="flex justify-between items-center border-b-2 border-amber-500 pb-5 mb-6">
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-slate-900">المملكة العربية السعودية</h4>
                    <h3 className="text-sm font-black text-slate-900">شركة عرب وورلد للمقاولات والتقسيط</h3>
                    <p className="text-[10px] font-bold text-slate-600">منظومة الحسابات الإدارية الموحدة</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-amber-600 flex items-center justify-center bg-amber-50">
                      <span className="font-extrabold text-amber-950 text-base font-sans">AW</span>
                    </div>
                    <span className="text-[8px] font-extrabold tracking-widest text-amber-700 mt-1">EST. 2024</span>
                  </div>
                  <div className="text-left space-y-1">
                    <p className="text-[10px] font-bold text-slate-700">التاريخ: {new Date().toLocaleDateString('ar-SA')} م</p>
                    <p className="text-[10px] font-bold text-slate-700">مستند معتمد رقابيًا</p>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-[9px] font-black text-slate-800">
                      🔒 كشف حساب معتمد
                    </span>
                  </div>
                </div>

                <div className="text-center space-y-1.5 mb-6">
                  <h2 className="text-lg font-black text-slate-900">كشف حركات حساب مالي تفصيلي</h2>
                  <p className="text-xs font-bold text-amber-800 flex items-center justify-center gap-1">
                    <span>الخزينة النشطة المستخرجة:</span>
                    <span className="underline font-black text-slate-950">{activeTab}</span>
                  </p>
                </div>

                {/* Brief calculation totals cards for paper view */}
                <div className="grid grid-cols-3 gap-3 mb-6 text-center text-xs">
                  <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                    <span className="text-[9px] font-black text-slate-400 block mb-0.5">واردات الخزنة (+)</span>
                    <b className="text-xs font-black text-emerald-700 font-mono">
                      +{(() => {
                        const sList = printScope === "filtered" ? filteredTxs : getCompiledTransactionsForSafe(activeTab);
                        return sList.reduce((acc, x) => acc + x.inbound, 0).toLocaleString();
                      })()} ريال
                    </b>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                    <span className="text-[9px] font-black text-slate-400 block mb-0.5">صادرات الخزنة (-)</span>
                    <b className="text-xs font-black text-rose-700 font-mono">
                      -{(() => {
                        const sList = printScope === "filtered" ? filteredTxs : getCompiledTransactionsForSafe(activeTab);
                        return sList.reduce((acc, x) => acc + x.outbound, 0).toLocaleString();
                      })()} ريال
                    </b>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-2.5 bg-amber-50/50 border-amber-200">
                    <span className="text-[9px] font-black text-amber-900 block mb-0.5">صافي رصيد العمليات بالورقة</span>
                    <b className="text-xs font-black text-slate-900 font-mono">
                      {(() => {
                        const sList = printScope === "filtered" ? filteredTxs : getCompiledTransactionsForSafe(activeTab);
                        const valIn = sList.reduce((acc, x) => acc + x.inbound, 0);
                        const valOut = sList.reduce((acc, x) => acc + x.outbound, 0);
                        const net = valIn - valOut;
                        return (net >= 0 ? "+" : "") + net.toLocaleString();
                      })()} ريال
                    </b>
                  </div>
                </div>

                <table className="w-full text-right border-collapse text-[9px] font-sans">
                  <thead>
                    <tr className="bg-slate-50 border-t border-b border-slate-300">
                      <th className="py-2 px-1.5 font-black text-slate-900 border-l border-slate-200">التاريخ</th>
                      <th className="py-2 px-1.5 font-black text-slate-900 border-l border-slate-200">النوع</th>
                      <th className="py-2 px-1.5 font-black text-slate-900 border-l border-slate-200">البيان والشرح التفصيلي للعملية</th>
                      <th className="py-2 px-1.5 font-black text-slate-900 border-l border-slate-200 text-left">الوارد (+)</th>
                      <th className="py-2 px-1.5 font-black text-slate-900 border-l border-slate-200 text-left">الصادر (-)</th>
                      <th className="py-2 px-1.5 font-black text-slate-900 text-left">الرصيد الجاري</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const sList = printScope === "filtered" ? filteredTxs : getCompiledTransactionsForSafe(activeTab);
                      if (sList.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400 font-bold">
                              لا توجد حركات حسابية متوفرة مطابقة للخيارات الحالية.
                            </td>
                          </tr>
                        );
                      }
                      return sList.map((tx, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-5 gap-1">
                          <td className="py-1.5 px-1 bg-slate-50/50 font-mono text-slate-700 border-l border-slate-150">{tx.date}</td>
                          <td className="py-1.5 px-1 font-extrabold text-slate-800 border-l border-slate-150">{tx.type}</td>
                          <td className="py-1.5 px-1 text-slate-700 text-[8.5px] border-l border-slate-150 max-w-xs truncate">{tx.desc}</td>
                          <td className="py-1.5 px-1 text-left font-mono font-bold text-emerald-800 border-l border-slate-150">
                            {tx.inbound > 0 ? `+${tx.inbound.toLocaleString()}` : "—"}
                          </td>
                          <td className="py-1.5 px-1 text-left font-mono font-bold text-rose-800 border-l border-slate-150">
                            {tx.outbound > 0 ? `-${tx.outbound.toLocaleString()}` : "—"}
                          </td>
                          <td className="py-1.5 px-1 text-left font-mono font-black text-slate-900 bg-slate-50/30">
                            {tx.balance.toLocaleString()} ريال
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>

                {/* Print signatures */}
                <div className="grid grid-cols-3 gap-6 mt-10 pt-5 border-t border-dashed border-slate-300 text-center text-[10px]">
                  <div>
                    <span className="block font-black text-slate-800">إعداد: المحاسب المالي</span>
                    <div className="h-8"></div>
                    <span className="block text-[8px] text-slate-400">التوقيع: ............................</span>
                  </div>
                  <div>
                    <span className="block font-black text-slate-800">تدقيق: الرقابة والامتثال</span>
                    <div className="h-8"></div>
                    <span className="block text-[8px] text-slate-400">التوقيع: ............................</span>
                  </div>
                  <div>
                    <span className="block font-black text-slate-800">اعتماد: الإدارة العامة والختم</span>
                    <div className="h-8"></div>
                    <span className="block text-[8px] text-slate-400">التوقيع والختم: ............................</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actual Hidden print document wrapper for browser paint windows layout */}
      <div id="custom-print-section" className="hidden">
        <div style={{ padding: "30px", fontFamily: "sans-serif", direction: "rtl", background: "#ffffff", color: "#000000" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #f59e0b", paddingBottom: "15px", marginBottom: "25px" }}>
            <div>
              <h4 style={{ margin: "0 0 4px 0", fontSize: "11px", fontWeight: "900" }}>المملكة العربية السعودية</h4>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", fontWeight: "900" }}>شركة عرب وورلد للمقاولات والتقسيط</h3>
              <p style={{ margin: "0", fontSize: "9px", color: "#475569" }}>المقر الرئيسي: الإدارة العامة والحسابات الموحدة</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "55px", height: "55px", borderRadius: "50%", border: "2px dashed #b45309", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fef3c7", margin: "0 auto" }}>
                <span style={{ fontSize: "13px", fontWeight: "900" }}>AW</span>
              </div>
              <span style={{ fontSize: "8px", fontWeight: "900", color: "#b45309", marginTop: "3px", display: "block" }}>EST. 2024</span>
            </div>
            <div style={{ textAlign: "left" }}>
              <p style={{ margin: "0 0 4px 0", fontSize: "9px" }}>التاريخ: {new Date().toLocaleDateString('ar-SA')} م</p>
              <p style={{ margin: "0", fontSize: "9px" }}>مستند معتمد كشف رسمي</p>
              <span style={{ display: "inline-block", marginTop: "4px", padding: "1px 6px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "3px", fontSize: "9px", fontWeight: "900" }}>🔒 تقرير مالي معتمد</span>
            </div>
          </div>

          {/* Title */}
          <div style={{ textAlign: "center", marginBottom: "25px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "900", margin: "0 0 8px 0" }}>كشف حركات حساب مالي تفصيلي للدفتر</h2>
            <p style={{ fontSize: "13px", fontWeight: "700", color: "#b45309", margin: "0" }}>
              الخزينة المستهدفة للبحث: <span style={{ textDecoration: "underline", color: "#000000", fontWeight: "900" }}>{activeTab}</span>
            </p>
            <p style={{ fontSize: "10px", color: "#64748b", margin: "4px 0 0 0" }}>نطاق العمليات المستدعاة: {printScope === "filtered" ? "القيود المفلترة الحالية" : "كل العمليات الحالية بالدفتر"}</p>
          </div>

          {/* Totals Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "15px", marginBottom: "25px", textAlign: "center" }}>
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px", backgroundColor: "#f8fafc" }}>
              <span style={{ fontSize: "9px", color: "#64748b", fontWeight: "900", display: "block" }}>إجمالي المقبوضات (الوارد)</span>
              <span style={{ fontSize: "13px", fontWeight: "900", color: "#15803d", fontFamily: "monospace", display: "block", marginTop: "4px" }}>
                +{(() => {
                  const sList = printScope === "filtered" ? filteredTxs : getCompiledTransactionsForSafe(activeTab);
                  return sList.reduce((acc, x) => acc + x.inbound, 0).toLocaleString();
                })()} ريال
              </span>
            </div>
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px", backgroundColor: "#f8fafc" }}>
              <span style={{ fontSize: "9px", color: "#64748b", fontWeight: "900", display: "block" }}>إجمالي المدفوعات (الصادر)</span>
              <span style={{ fontSize: "13px", fontWeight: "900", color: "#b91c1c", fontFamily: "monospace", display: "block", marginTop: "4px" }}>
                -{(() => {
                  const sList = printScope === "filtered" ? filteredTxs : getCompiledTransactionsForSafe(activeTab);
                  return sList.reduce((acc, x) => acc + x.outbound, 0).toLocaleString();
                })()} ريال
              </span>
            </div>
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "10px", backgroundColor: "#fffbeb" }}>
              <span style={{ fontSize: "9px", color: "#b45309", fontWeight: "900", display: "block" }}>الصافي الروحي المتراكم بالورقة</span>
              <span style={{ fontSize: "13px", fontWeight: "900", color: "#000000", fontFamily: "monospace", display: "block", marginTop: "4px" }}>
                {(() => {
                  const sList = printScope === "filtered" ? filteredTxs : getCompiledTransactionsForSafe(activeTab);
                  const valIn = sList.reduce((acc, x) => acc + x.inbound, 0);
                  const valOut = sList.reduce((acc, x) => acc + x.outbound, 0);
                  const net = valIn - valOut;
                  return (net >= 0 ? "+" : "") + net.toLocaleString();
                })()} ريال
              </span>
            </div>
          </div>

          {/* Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", textAlign: "right" }}>
            <thead>
              <tr style={{ backgroundColor: "#f1f5f9", borderTop: "1px solid #64748b", borderBottom: "1px solid #64748b" }}>
                <th style={{ padding: "6px", fontWeight: "950", borderLeft: "1px solid #cbd5e1" }}>التاريخ</th>
                <th style={{ padding: "6px", fontWeight: "950", borderLeft: "1px solid #cbd5e1" }}>النوع</th>
                <th style={{ padding: "6px", fontWeight: "950", borderLeft: "1px solid #cbd5e1" }}>البيان والشرح الكامل للدفتر المالي</th>
                <th style={{ padding: "6px", fontWeight: "950", borderLeft: "1px solid #cbd5e1", textAlign: "left" }}>الوارد (+)</th>
                <th style={{ padding: "6px", fontWeight: "950", borderLeft: "1px solid #cbd5e1", textAlign: "left" }}>الصادر (-)</th>
                <th style={{ padding: "6px", fontWeight: "950", textAlign: "left" }}>الرصيد الجاري</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const sList = printScope === "filtered" ? filteredTxs : getCompiledTransactionsForSafe(activeTab);
                if (sList.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontWeight: "bold" }}>
                        لا توجد حركات حسابية متوفرة مطابقة للخيارات الحالية.
                      </td>
                    </tr>
                  );
                }
                return sList.map((tx, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "6px", fontFamily: "monospace", borderLeft: "1px solid #cbd5e1" }}>{tx.date}</td>
                    <td style={{ padding: "6px", fontWeight: "900", borderLeft: "1px solid #cbd5e1" }}>{tx.type}</td>
                    <td style={{ padding: "6px", borderLeft: "1px solid #cbd5e1", fontSize: "9px" }}>{tx.desc}</td>
                    <td style={{ padding: "6px", color: "#15803d", fontWeight: "bold", fontFamily: "monospace", textAlign: "left", borderLeft: "1px solid #cbd5e1" }}>
                      {tx.inbound > 0 ? `+${tx.inbound.toLocaleString()}` : "—"}
                    </td>
                    <td style={{ padding: "6px", color: "#b91c1c", fontWeight: "bold", fontFamily: "monospace", textAlign: "left", borderLeft: "1px solid #cbd5e1" }}>
                      {tx.outbound > 0 ? `-${tx.outbound.toLocaleString()}` : "—"}
                    </td>
                    <td style={{ padding: "6px", fontWeight: "900", fontFamily: "monospace", textAlign: "left" }}>
                      {tx.balance.toLocaleString()} ريال
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>

          {/* Signatures */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginTop: "40px", borderTop: "2px dashed #cbd5e1", paddingTop: "20px", textAlign: "center", fontSize: "11px" }}>
            <div>
              <span style={{ fontWeight: "900", display: "block" }}>توقيع المحاسب الجنائي المالي</span>
              <div style={{ height: "40px" }}></div>
              <span style={{ fontSize: "9px", color: "#94a3b8" }}>............................................</span>
            </div>
            <div>
              <span style={{ fontWeight: "900", display: "block" }}>رقابة ومطابقة الحسابات</span>
              <div style={{ height: "40px" }}></div>
              <span style={{ fontSize: "9px", color: "#94a3b8" }}>............................................</span>
            </div>
            <div>
              <span style={{ fontWeight: "900", display: "block" }}>مصادقة المدير العام والختم</span>
              <div style={{ height: "40px" }}></div>
              <span style={{ fontSize: "9px", color: "#94a3b8" }}>............................................</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
