/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  FileText, Landmark, TrendingUp, TrendingDown, ClipboardCheck,
  AlertTriangle, Receipt, Calendar, ArrowUpRight, ShieldCheck, ChevronLeft
} from "lucide-react";
import { Installment, Receipt as ReceiptType } from "../types";
import { getContractTiming } from "../db";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = {
  "مدى": "#38bdf8",     // Bright Sky Blue (Premium)
  "تحويل": "#fbbf24",   // Amber Gold (Premium)
  "نقداً": "#34d399",   // Emerald Mint (Premium)
};
const DEFAULT_COLOR = "#94a3b8"; // Slate

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-950/95 border border-slate-800/80 p-3 rounded-2xl shadow-2xl text-right z-50">
        <p className="text-xs font-black text-white mb-1">{data.name}</p>
        <p className="text-sm font-black text-amber-400 font-mono">
          {Number(data.value).toLocaleString()} <span className="text-[10px] font-bold text-slate-400">ريال</span>
        </p>
      </div>
    );
  }
  return null;
};

interface DashboardProps {
  installments: Installment[];
  receipts: ReceiptType[];
  payments: any[];
  expenses: any[];
  onNavigateToContracts: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  installments,
  receipts,
  payments,
  expenses,
  onNavigateToContracts
}) => {
  // Global totals
  const totalContractsCount = installments.length;
  const totalContractsAmount = installments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalCollectedReceipts = receipts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalOutgoingPayments = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalOutgoingExpenses = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalOutflows = totalOutgoingPayments + totalOutgoingExpenses;
  const treasuryBalance = totalCollectedReceipts - totalOutflows;
  const totalRemainingContracts = installments.reduce((sum, item) => sum + Number(item.remaining || 0), 0);

  // Arrears list & calculations
  const analyzedContracts = installments.map((item) => ({
    contract: item,
    timing: getContractTiming(item),
  }));

  const lateContractsCount = analyzedContracts.filter((o) => o.timing.overdueDays > 0).length;

  // ملخص التحصيل الذكي
  // المطلوب حتى اليوم = sum min(contract.amount, start_date -> today due days * installment)
  const dueAmountTillToday = analyzedContracts.reduce((sum, o) => {
    const startNum = o.timing.dueDays * Number(o.contract.installment || 0);
    return sum + Math.min(Number(o.contract.amount || 0), startNum);
  }, 0);

  const collectedActual = totalCollectedReceipts;
  const overdueOnlyAmount = analyzedContracts.reduce((sum, o) => sum + Number(o.timing.overdueAmount || 0), 0);
  const collectionPercentage = dueAmountTillToday > 0 
    ? Math.min(100, Math.round((collectedActual / dueAmountTillToday) * 100)) 
    : 0;

  // نبض المتأخرات counts
  const shortLateCount = analyzedContracts.filter((o) => o.timing.overdueDays >= 1 && o.timing.overdueDays <= 7).length;
  const midLateCount = analyzedContracts.filter((o) => o.timing.overdueDays >= 8 && o.timing.overdueDays <= 30).length;
  const longLateCount = analyzedContracts.filter((o) => o.timing.overdueDays > 30).length;

  let riskText = "الوضع العام ممتاز ومستقر";
  let riskBadgeColor = "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
  if (longLateCount > 0) {
    riskText = `تنبيه: يوجد عدد ${longLateCount} عملاء تجاوزوا 30 يوم من التأخر المستمر!`;
    riskBadgeColor = "text-rose-400 border-rose-500/30 bg-rose-500/10 glowing-rose";
  } else if (midLateCount > 0) {
    riskText = "يوجد متأخرات متوسطة تحتاج لمتابعة وتنبيه هذا الأسبوع.";
    riskBadgeColor = "text-amber-400 border-amber-500/30 bg-amber-500/10";
  }

  // Overdue clients sorted from worst
  const lateClientsList = analyzedContracts
    .filter((o) => o.timing.overdueDays > 0)
    .sort((a, b) => b.timing.overdueDays - a.timing.overdueDays)
    .slice(0, 5);

  // Latest 5 receipts
  const latestReceiptsFeed = [...receipts]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 5);

  // Calculate distribution of collection amounts by payment method (نقداً، مدى، تحويل)
  const methodDistribution = React.useMemo(() => {
    const sums: Record<string, number> = {
      "مدى": 0,
      "تحويل": 0,
      "نقداً": 0,
    };

    receipts.forEach((rec) => {
      const amt = Number(rec.amount || 0);
      const m = (rec.method || "").trim();
      
      if (m.includes("مدى") || m.includes("مدي")) {
        sums["مدى"] += amt;
      } else if (m.includes("تحويل")) {
        sums["تحويل"] += amt;
      } else if (m.includes("نقدا") || m.includes("نقداً") || m.includes("نقدي") || m.includes("كاش") || m.includes("نقد")) {
        sums["نقداً"] += amt;
      } else {
        if (m) {
          if (!sums[m]) sums[m] = 0;
          sums[m] += amt;
        } else {
          sums["نقداً"] += amt;
        }
      }
    });

    return Object.entries(sums).map(([name, value]) => ({
      name,
      value,
    }));
  }, [receipts]);

  // Upcoming collections based on start date and paid sums
  const upcomingPaymentsFeed = analyzedContracts
    .filter((o) => o.timing.lastPaid && o.timing.lastPaid !== "غير مسدد" && o.contract.status !== "مكتمل")
    .sort((a, b) => String(b.timing.lastPaid).localeCompare(String(a.timing.lastPaid)))
    .slice(0, 5);

  // KPI card elements helper
  const topStats = [
    { title: "عدد العقود", value: totalContractsCount.toLocaleString(), unit: "عقد", icon: FileText, color: "text-blue-400 border-blue-500/20" },
    { title: "إجمالي العقود", value: totalContractsAmount.toLocaleString(), unit: "ريال", icon: ClipboardCheck, color: "text-indigo-400 border-indigo-500/20" },
    { title: "إجمالي القبض", value: totalCollectedReceipts.toLocaleString(), unit: "ريال", icon: Landmark, color: "text-emerald-400 border-emerald-500/20" },
    { title: "إجمالي الصرف", value: totalOutflows.toLocaleString(), unit: "ريال", icon: TrendingDown, color: "text-red-400 border-red-500/20" },
    { title: "رصيد الخزنة", value: treasuryBalance.toLocaleString(), unit: "ريال", icon: ShieldCheck, color: "text-cyan-400 border-cyan-500/20" },
    { title: "إجمالي المتبقي", value: totalRemainingContracts.toLocaleString(), unit: "ريال", icon: TrendingUp, color: "text-teal-400 border-teal-500/20" },
    { title: "المتأخرات المعلقة", value: lateContractsCount.toLocaleString(), unit: "عقد", icon: AlertTriangle, color: "text-amber-400 border-amber-500/20" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* KPI Display Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {topStats.map((stat, idx) => (
          <div
            key={idx}
            className={`bg-slate-900/50 backdrop-blur-md rounded-2xl p-4 border ${stat.color} shadow-lg shadow-black/10 transition-transform duration-200 hover:scale-[1.02] flex flex-col justify-between`}
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-black text-slate-400 leading-tight">{stat.title}</span>
              <stat.icon className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="mt-2">
              <span className="text-lg font-black text-white">{stat.value}</span>
              <span className="text-[10px] font-bold text-slate-500 block">{stat.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main interactive grid containing pulse reports & smart summaries */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* ملخص التحصيل الذكي (Collection Engine Summary) */}
        <div className="relative overflow-hidden lg:col-span-8 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-44 h-44 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10" />
          
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400">💎</span>
              ملخص التحصيل الذكي للشركة
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
                <span className="block text-[11px] font-bold text-slate-400 mb-1">المطلوب حتى اليوم</span>
                <b className="text-sm font-black text-white">{dueAmountTillToday.toLocaleString()} <span className="text-[10px] font-normal">ريال</span></b>
              </div>
              <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
                <span className="block text-[11px] font-bold text-slate-400 mb-1">المسدد فعلياً</span>
                <b className="text-sm font-black text-white">{collectedActual.toLocaleString()} <span className="text-[10px] font-normal">ريال</span></b>
              </div>
              <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
                <span className="block text-[11px] font-bold text-slate-400 mb-1">المتأخر الفعلي</span>
                <b className="text-sm font-black text-rose-400">{overdueOnlyAmount.toLocaleString()} <span className="text-[10px] font-normal">ريال</span></b>
              </div>
              <div className="bg-slate-950/40 border border-emerald-500/20 p-4 rounded-xl">
                <span className="block text-[11px] font-bold text-slate-400 mb-1">نسبة التحصيل الذكي</span>
                <b className="text-sm font-black text-emerald-400">{collectionPercentage}%</b>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {/* Custom filled progress shell */}
            <div className="h-2.5 w-full bg-slate-950/60 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-l from-emerald-500 via-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                style={{ width: `${collectionPercentage}%` }}
              />
            </div>
            <p className="text-xs font-bold text-amber-500/80 bg-amber-500/5 border border-amber-500/10 px-4 py-3 rounded-xl leading-relaxed">
              💡 الحساب الذكي يعتمد على الأقساط والالتزامات المستحقة تاريخياً حتى اللحظة الحالية فقط، مخصوماً منها السداد والقبض الفعلي.
            </p>
          </div>
        </div>

        {/* نبض المتأخرات */}
        <div className="lg:col-span-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2 mb-4">
              <span className="p-1.5 rounded-lg bg-rose-600/20 border border-rose-500/30 text-rose-400">⚡</span>
              نبض وتوزيع المتأخرات
            </h3>

            {/* Arrears visual indicators */}
            <div className="grid grid-cols-3 gap-2 text-center my-4">
              <div className="bg-slate-950/40 border border-slate-850 p-3 rounded-2xl">
                <b className="text-2xl font-black text-amber-400">{shortLateCount}</b>
                <span className="block text-[10px] font-bold text-slate-400 mt-1">1 - 7 أيام</span>
              </div>
              <div className="bg-slate-950/40 border border-slate-850 p-3 rounded-2xl">
                <b className="text-2xl font-black text-orange-400">{midLateCount}</b>
                <span className="block text-[10px] font-bold text-slate-400 mt-1">8 - 30 يوم</span>
              </div>
              <div className="bg-slate-950/40 border border-rose-500/20 p-3 rounded-2xl">
                <b className="text-2xl font-black text-rose-400">{longLateCount}</b>
                <span className="block text-[10px] font-bold text-slate-400 mt-1">أكثر من 30</span>
              </div>
            </div>
          </div>

          <div className={`p-3.5 border rounded-xl text-center text-xs font-black leading-relaxed ${riskBadgeColor}`}>
            {riskText}
          </div>
        </div>

        {/* قائمة المتأخرين */}
        <div className="lg:col-span-8 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-slate-800/80 pb-4">
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-orange-600/20 border border-orange-500/30 text-orange-400">🚨</span>
                قائمة العملاء المتأخرين
              </h3>
              <p className="text-[11px] font-bold text-slate-400 mt-0.5">مرتبة تلقائياً من أعلى أيام تأخر مستحق في السداد</p>
            </div>
            <button
              onClick={onNavigateToContracts}
              className="flex items-center gap-1 px-4 py-2 bg-slate-950/60 border border-slate-800 text-xs font-black text-amber-400 hover:text-white rounded-xl transition-all hover:bg-amber-600/20"
            >
              استعراض العقود الشاملة
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs md:text-sm">
              <thead>
                <tr className="bg-slate-950/20 border-b border-slate-850 text-slate-400">
                  <th className="py-3 px-4 font-black">العميل</th>
                  <th className="py-3 px-4 font-black">رقم العقد</th>
                  <th className="py-3 px-4 font-black">آخر يوم سداد</th>
                  <th className="py-3 px-4 font-black text-center">أيام التأخير</th>
                  <th className="py-3 px-4 font-black">المبلغ المتأخر</th>
                  <th className="py-3 px-4 font-black">المتبقي الكلي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/40">
                {lateClientsList.length > 0 ? (
                  lateClientsList.map((client, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/10 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white">{client.contract.client}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">{client.contract.no}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">{client.timing.lastPaid}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-black bg-rose-500/10 border border-rose-500/20 text-rose-400">
                          {client.timing.overdueDays} يومًا
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-rose-400 font-mono">
                        {client.timing.overdueAmount.toLocaleString()} ريال
                      </td>
                      <td className="py-3.5 px-4 font-extrabold text-slate-300 font-mono">
                        {Number(client.contract.remaining || 0).toLocaleString()} ريال
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 font-extrabold">
                      🎉 لا توجد أي متأخرات سداد للعملاء حالياً!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* توزيع مبالغ التحصيل حسب طريقة الدفع (Pie Chart) */}
        <div className="lg:col-span-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2 border-b border-slate-800/80 pb-3 mb-4">
              <span className="p-1.5 rounded-lg bg-amber-600/20 border border-amber-500/30 text-amber-400">📊</span>
              توزيع التحصيل حسب طريقة الدفع
            </h3>

            <div className="h-[200px] w-full flex items-center justify-center relative mt-4">
              {/* Central Text for Donut Chart */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                <span className="text-[9px] font-bold text-slate-450 uppercase tracking-widest leading-none">إجمالي التحصيل</span>
                <span className="text-lg font-black text-white mt-2 font-mono leading-none">
                  {totalCollectedReceipts.toLocaleString()}
                </span>
                <span className="text-[10px] font-black text-amber-500 mt-1">ريال</span>
              </div>

              {totalCollectedReceipts === 0 ? (
                <div className="text-center text-slate-500 font-bold text-xs space-y-1.5 z-20">
                  <p>🚫 لا توجد بيانات تحصيل حالياً لعرضها</p>
                  <p className="text-[10px] font-normal text-slate-600">سجل عمليات القبض لتحديث المخطط</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={methodDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={82}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {methodDistribution.map((entry, index) => {
                        const name = entry.name as keyof typeof COLORS;
                        return (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[name] || DEFAULT_COLOR}
                            stroke="#0f172a"
                            strokeWidth={3}
                          />
                        );
                      })}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Premium Legend & Distribution % */}
            <div className="grid grid-cols-3 gap-2 text-center mt-4 border-t border-slate-850/60 pt-4">
              {methodDistribution.map((item, index) => {
                const name = item.name as keyof typeof COLORS;
                const percent = totalCollectedReceipts > 0 ? Math.round((item.value / totalCollectedReceipts) * 100) : 0;
                return (
                  <div key={index} className="bg-slate-950/40 border border-slate-850/60 p-2 rounded-2xl flex flex-col justify-between hover:border-slate-800 transition-all">
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: COLORS[name] || DEFAULT_COLOR }}
                      />
                      <span className="text-[10px] font-black text-slate-400">{item.name}</span>
                    </div>
                    <div className="mt-1.5">
                      <b className="block text-xs font-black text-white font-mono">{item.value.toLocaleString()}</b>
                      <span className="block text-[9px] font-bold text-slate-500 mt-0.5">{percent}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* آخر 5 سندات قبض */}
        <div className="lg:col-span-6 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2 border-b border-slate-800/80 pb-3 mb-4">
              <span className="p-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400">📌</span>
              آخر 5 سندات قبض مستلمة
            </h3>

            <div className="space-y-3">
              {latestReceiptsFeed.length > 0 ? (
                latestReceiptsFeed.map((rec, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center gap-4 bg-slate-950/40 p-3 rounded-2xl border border-slate-850"
                  >
                    <div>
                      <h4 className="text-sm font-black text-white leading-relaxed">{rec.from_name || "اسم غير مسجل"}</h4>
                      <p className="text-[10px] font-bold text-slate-400 mt-1">
                        تاريخ: {rec.date} • عقد: {rec.contract_no || "عام"}
                      </p>
                    </div>
                    <div className="text-left shrink-0">
                      <b className="text-base font-black text-emerald-400 font-mono">+{Number(rec.amount || 0).toLocaleString()}</b>
                      <span className="block text-[8px] font-bold text-slate-500">ريال سعودي</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center py-10 text-slate-500 font-bold">لا توجد سندات قبض مسجلة حالياً.</p>
              )}
            </div>
          </div>
        </div>

        {/* آخر أيام السداد القادمة */}
        <div className="lg:col-span-6 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2 border-b border-slate-800/80 pb-3 mb-4">
              <span className="p-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">📅</span>
              آخر أيام السداد القادمة للعملاء
            </h3>

            <div className="space-y-3">
              {upcomingPaymentsFeed.length > 0 ? (
                upcomingPaymentsFeed.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center gap-4 bg-slate-950/40 p-3 rounded-2xl border border-slate-850"
                  >
                    <div>
                      <h4 className="text-sm font-black text-white leading-relaxed">{item.contract.client}</h4>
                      <p className="text-[10px] font-bold text-slate-300 mt-1">رقم العقد: {item.contract.no}</p>
                    </div>
                    <div className="text-left shrink-0">
                      <b className="text-sm font-semibold text-indigo-400 font-mono bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-lg">
                        {item.timing.lastPaid}
                      </b>
                      <span className="block text-[8px] font-bold text-slate-500 mt-1 text-center">أخر سداد</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center py-10 text-slate-500 font-bold">لا توجد سجلات مستحقة قادمة.</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
