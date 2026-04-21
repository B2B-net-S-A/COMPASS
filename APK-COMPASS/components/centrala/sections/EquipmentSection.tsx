'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog as FormDialog,
    DialogContent as FormDialogContent,
    DialogHeader as FormDialogHeader,
    DialogTitle as FormDialogTitle,
    DialogDescription as FormDialogDescription,
    DialogFooter as FormDialogFooter,
} from "@/components/ui/dialog"
import {
    Laptop,
    MousePointer2,
    Keyboard,
    Monitor,
    Truck,
    Clock,
    CheckCircle2,
    AlertCircle,
    Wrench,
    Mail,
    ChevronRight,
    Send,
    X,
    Package,
    Info
} from "lucide-react"
import { useState } from "react"
import { submitEquipmentRequest } from "@/lib/actions/centrala"

interface EquipmentSectionProps {
    profileId: string
    initialData?: any[]
}

type FormCategory = 'laptop' | 'monitor' | 'peripherals' | null

interface LaptopFormData {
    deviceType: string
    os: string
    ramMin: string
    diskSize: string
    processor: string
    screenSize: string
    additionalAccessories: string
    justification: string
    neededBy: string
    priority: string
}

interface MonitorFormData {
    monitorType: string
    screenSize: string
    resolution: string
    panelType: string
    quantity: string
    mountType: string
    additionalCables: string
    justification: string
    neededBy: string
    priority: string
}

interface PeripheralsFormData {
    deviceType: string
    connectivity: string
    preferredBrand: string
    layout: string
    quantity: string
    additionalItems: string
    justification: string
    neededBy: string
    priority: string
}

const initialLaptopForm: LaptopFormData = {
    deviceType: '',
    os: '',
    ramMin: '',
    diskSize: '',
    processor: '',
    screenSize: '',
    additionalAccessories: '',
    justification: '',
    neededBy: '',
    priority: 'normalny'
}

const initialMonitorForm: MonitorFormData = {
    monitorType: '',
    screenSize: '',
    resolution: '',
    panelType: '',
    quantity: '1',
    mountType: '',
    additionalCables: '',
    justification: '',
    neededBy: '',
    priority: 'normalny'
}

const initialPeripheralsForm: PeripheralsFormData = {
    deviceType: '',
    connectivity: '',
    preferredBrand: '',
    layout: '',
    quantity: '1',
    additionalItems: '',
    justification: '',
    neededBy: '',
    priority: 'normalny'
}

export function EquipmentSection({ profileId, initialData = [] }: EquipmentSectionProps) {
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [activeForm, setActiveForm] = useState<FormCategory>(null)
    const [laptopForm, setLaptopForm] = useState<LaptopFormData>(initialLaptopForm)
    const [monitorForm, setMonitorForm] = useState<MonitorFormData>(initialMonitorForm)
    const [peripheralsForm, setPeripheralsForm] = useState<PeripheralsFormData>(initialPeripheralsForm)
    const [submitSuccess, setSubmitSuccess] = useState(false)

    const statusMap: Record<string, { label: string, color: string, icon: React.FC<any> }> = {
        'w_toku': { label: 'W trakcie', color: 'text-orange-400 bg-orange-400/10', icon: Clock },
        'dostarczono': { label: 'Dostarczono', color: 'text-green-400 bg-green-400/10', icon: CheckCircle2 },
        'odrzucono': { label: 'Odrzucono', color: 'text-red-400 bg-red-400/10', icon: AlertCircle }
    }

    const handleSubmit = async () => {
        setIsSubmitting(true)
        try {
            let itemName = ''
            let details = ''

            if (activeForm === 'laptop') {
                itemName = `Laptop / Akcesoria: ${laptopForm.deviceType}`
                details = JSON.stringify(laptopForm)
            } else if (activeForm === 'monitor') {
                itemName = `Ekran / Monitor: ${monitorForm.monitorType}`
                details = JSON.stringify(monitorForm)
            } else if (activeForm === 'peripherals') {
                itemName = `Klawiatura / Mysz: ${peripheralsForm.deviceType}`
                details = JSON.stringify(peripheralsForm)
            }

            const category = activeForm === 'peripherals' ? 'Peryferia' : 'Sprzęt'
            await submitEquipmentRequest(profileId, itemName, category, details)

            setSubmitSuccess(true)
            // Reset forms
            setLaptopForm(initialLaptopForm)
            setMonitorForm(initialMonitorForm)
            setPeripheralsForm(initialPeripheralsForm)

            setTimeout(() => {
                setSubmitSuccess(false)
                setActiveForm(null)
            }, 2500)
        } catch (error) {
            console.error("Error submitting equipment request:", error)
            alert("Wystąpił błąd podczas składania zamówienia. Spróbuj ponownie.")
        } finally {
            setIsSubmitting(false)
        }
    }

    const isFormValid = () => {
        if (activeForm === 'laptop') {
            return laptopForm.deviceType && laptopForm.justification
        }
        if (activeForm === 'monitor') {
            return monitorForm.monitorType && monitorForm.justification
        }
        if (activeForm === 'peripherals') {
            return peripheralsForm.deviceType && peripheralsForm.justification
        }
        return false
    }

    // ============================================================
    //  LAPTOP / AKCESORIA FORM
    // ============================================================
    const renderLaptopForm = () => (
        <div className="space-y-5">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-200 mt-0.5 shrink-0" />
                <p className="text-[11px] text-foreground/80 leading-relaxed">
                    Wypełnij formularz zamówienia sprzętu. Pola oznaczone <span className="text-pink-400">*</span> są wymagane. Zamówienie zostanie przekazane do działu IT.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">
                        Typ urządzenia <span className="text-pink-400">*</span>
                    </Label>
                    <Select value={laptopForm.deviceType} onValueChange={(v) => setLaptopForm({...laptopForm, deviceType: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Wybierz typ..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Laptop">Laptop</SelectItem>
                            <SelectItem value="Stacja dokująca">Stacja dokująca</SelectItem>
                            <SelectItem value="Zasilacz / Ładowarka">Zasilacz / Ładowarka</SelectItem>
                            <SelectItem value="Torba / Plecak na laptopa">Torba / Plecak na laptopa</SelectItem>
                            <SelectItem value="Kamera internetowa">Kamera internetowa</SelectItem>
                            <SelectItem value="Słuchawki / Zestaw głośnomówiący">Słuchawki / Zestaw głośnomówiący</SelectItem>
                            <SelectItem value="Hub USB / Adapter">Hub USB / Adapter</SelectItem>
                            <SelectItem value="Inne">Inne (opisz w uzasadnieniu)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">System operacyjny</Label>
                    <Select value={laptopForm.os} onValueChange={(v) => setLaptopForm({...laptopForm, os: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Wybierz system..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Windows 11">Windows 11</SelectItem>
                            <SelectItem value="macOS">macOS (MacBook)</SelectItem>
                            <SelectItem value="Linux">Linux</SelectItem>
                            <SelectItem value="Bez preferencji">Bez preferencji</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Minimalna pamięć RAM</Label>
                    <Select value={laptopForm.ramMin} onValueChange={(v) => setLaptopForm({...laptopForm, ramMin: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Wybierz RAM..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="8 GB">8 GB</SelectItem>
                            <SelectItem value="16 GB">16 GB</SelectItem>
                            <SelectItem value="32 GB">32 GB</SelectItem>
                            <SelectItem value="64 GB">64 GB</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Dysk SSD</Label>
                    <Select value={laptopForm.diskSize} onValueChange={(v) => setLaptopForm({...laptopForm, diskSize: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Pojemność dysku..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="256 GB">256 GB</SelectItem>
                            <SelectItem value="512 GB">512 GB</SelectItem>
                            <SelectItem value="1 TB">1 TB</SelectItem>
                            <SelectItem value="2 TB">2 TB</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Typ procesora</Label>
                    <Select value={laptopForm.processor} onValueChange={(v) => setLaptopForm({...laptopForm, processor: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Wybierz procesor..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Intel Core i5 / AMD Ryzen 5">Intel Core i5 / AMD Ryzen 5</SelectItem>
                            <SelectItem value="Intel Core i7 / AMD Ryzen 7">Intel Core i7 / AMD Ryzen 7</SelectItem>
                            <SelectItem value="Intel Core i9 / AMD Ryzen 9">Intel Core i9 / AMD Ryzen 9</SelectItem>
                            <SelectItem value="Apple M3">Apple M3</SelectItem>
                            <SelectItem value="Apple M3 Pro">Apple M3 Pro</SelectItem>
                            <SelectItem value="Apple M4 Pro">Apple M4 Pro</SelectItem>
                            <SelectItem value="Bez preferencji">Bez preferencji</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Przekątna ekranu</Label>
                    <Select value={laptopForm.screenSize} onValueChange={(v) => setLaptopForm({...laptopForm, screenSize: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Rozmiar ekranu..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="13 cali">13"</SelectItem>
                            <SelectItem value="14 cali">14"</SelectItem>
                            <SelectItem value="15 cali">15"</SelectItem>
                            <SelectItem value="16 cali">16"</SelectItem>
                            <SelectItem value="17 cali">17"</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Priorytet</Label>
                    <Select value={laptopForm.priority} onValueChange={(v) => setLaptopForm({...laptopForm, priority: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="niski">Niski</SelectItem>
                            <SelectItem value="normalny">Normalny</SelectItem>
                            <SelectItem value="wysoki">Wysoki</SelectItem>
                            <SelectItem value="pilny">Pilny</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Potrzebne do (data)</Label>
                    <Input
                        type="date"
                        className="bg-black/30 border-white/10 text-sm h-9"
                        value={laptopForm.neededBy}
                        onChange={(e) => setLaptopForm({...laptopForm, neededBy: e.target.value})}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-xs text-gray-300">Dodatkowe akcesoria</Label>
                <Input
                    className="bg-black/30 border-white/10 text-sm h-9"
                    placeholder="np. przejściówka USB-C → HDMI, dodatkowy zasilacz..."
                    value={laptopForm.additionalAccessories}
                    onChange={(e) => setLaptopForm({...laptopForm, additionalAccessories: e.target.value})}
                />
            </div>

            <div className="space-y-2">
                <Label className="text-xs text-gray-300">
                    Uzasadnienie / Cel <span className="text-pink-400">*</span>
                </Label>
                <Textarea
                    className="bg-black/30 border-white/10 text-sm min-h-[80px] resize-none"
                    placeholder="Opisz do czego potrzebujesz sprzętu, np. rozpoczęcie nowego projektu, wymiana uszkodzonego sprzętu..."
                    value={laptopForm.justification}
                    onChange={(e) => setLaptopForm({...laptopForm, justification: e.target.value})}
                />
            </div>
        </div>
    )

    // ============================================================
    //  EKRAN / MONITOR FORM
    // ============================================================
    const renderMonitorForm = () => (
        <div className="space-y-5">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-200 mt-0.5 shrink-0" />
                <p className="text-[11px] text-foreground/80 leading-relaxed">
                    Zamów monitor lub akcesoria do stanowiska pracy. Pola oznaczone <span className="text-pink-400">*</span> są wymagane.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">
                        Typ urządzenia <span className="text-pink-400">*</span>
                    </Label>
                    <Select value={monitorForm.monitorType} onValueChange={(v) => setMonitorForm({...monitorForm, monitorType: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Wybierz typ..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Monitor">Monitor</SelectItem>
                            <SelectItem value="Monitor ultrapanoramiczny">Monitor ultrapanoramiczny (21:9)</SelectItem>
                            <SelectItem value="Monitor przenośny">Monitor przenośny / portable</SelectItem>
                            <SelectItem value="Uchwyt na monitor">Uchwyt na monitor (1 ramię)</SelectItem>
                            <SelectItem value="Uchwyt na 2 monitory">Uchwyt na 2 monitory</SelectItem>
                            <SelectItem value="Kabel HDMI / DisplayPort">Kabel HDMI / DisplayPort</SelectItem>
                            <SelectItem value="Adapter / Przejściówka">Adapter / Przejściówka video</SelectItem>
                            <SelectItem value="Inne">Inne (opisz w uzasadnieniu)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Rozmiar ekranu</Label>
                    <Select value={monitorForm.screenSize} onValueChange={(v) => setMonitorForm({...monitorForm, screenSize: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Przekątna..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="24 cali">24"</SelectItem>
                            <SelectItem value="27 cali">27"</SelectItem>
                            <SelectItem value="32 cale">32"</SelectItem>
                            <SelectItem value="34 cale (ultrawide)">34" (ultrawide)</SelectItem>
                            <SelectItem value="38+ cali">38"+ </SelectItem>
                            <SelectItem value="Nie dotyczy">Nie dotyczy</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Rozdzielczość</Label>
                    <Select value={monitorForm.resolution} onValueChange={(v) => setMonitorForm({...monitorForm, resolution: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Wybierz rozdzielczość..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Full HD (1920x1080)">Full HD (1920x1080)</SelectItem>
                            <SelectItem value="QHD (2560x1440)">QHD / 2K (2560x1440)</SelectItem>
                            <SelectItem value="4K UHD (3840x2160)">4K UHD (3840x2160)</SelectItem>
                            <SelectItem value="UWQHD (3440x1440)">UWQHD (3440x1440)</SelectItem>
                            <SelectItem value="Bez preferencji">Bez preferencji</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Typ panelu</Label>
                    <Select value={monitorForm.panelType} onValueChange={(v) => setMonitorForm({...monitorForm, panelType: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Panel..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="IPS">IPS (szerokie kąty widzenia)</SelectItem>
                            <SelectItem value="VA">VA (lepszy kontrast)</SelectItem>
                            <SelectItem value="OLED">OLED</SelectItem>
                            <SelectItem value="Bez preferencji">Bez preferencji</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Typ uchwytu / montaż</Label>
                    <Select value={monitorForm.mountType} onValueChange={(v) => setMonitorForm({...monitorForm, mountType: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Montaż..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Standardowa stopka">Standardowa stopka</SelectItem>
                            <SelectItem value="Uchwyt biurkowy (1 ramię)">Uchwyt biurkowy (1 ramię)</SelectItem>
                            <SelectItem value="Uchwyt biurkowy (2 ramiona)">Uchwyt biurkowy (2 ramiona)</SelectItem>
                            <SelectItem value="Uchwyt ścienny VESA">Uchwyt ścienny VESA</SelectItem>
                            <SelectItem value="Nie potrzebuję">Nie potrzebuję</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Ilość sztuk</Label>
                    <Select value={monitorForm.quantity} onValueChange={(v) => setMonitorForm({...monitorForm, quantity: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Priorytet</Label>
                    <Select value={monitorForm.priority} onValueChange={(v) => setMonitorForm({...monitorForm, priority: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="niski">Niski</SelectItem>
                            <SelectItem value="normalny">Normalny</SelectItem>
                            <SelectItem value="wysoki">Wysoki</SelectItem>
                            <SelectItem value="pilny">Pilny</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Potrzebne do (data)</Label>
                    <Input
                        type="date"
                        className="bg-black/30 border-white/10 text-sm h-9"
                        value={monitorForm.neededBy}
                        onChange={(e) => setMonitorForm({...monitorForm, neededBy: e.target.value})}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-xs text-gray-300">Dodatkowe kable / akcesoria</Label>
                <Input
                    className="bg-black/30 border-white/10 text-sm h-9"
                    placeholder="np. kabel USB-C → DisplayPort, przedłużacz HDMI..."
                    value={monitorForm.additionalCables}
                    onChange={(e) => setMonitorForm({...monitorForm, additionalCables: e.target.value})}
                />
            </div>

            <div className="space-y-2">
                <Label className="text-xs text-gray-300">
                    Uzasadnienie / Cel <span className="text-pink-400">*</span>
                </Label>
                <Textarea
                    className="bg-black/30 border-white/10 text-sm min-h-[80px] resize-none"
                    placeholder="Opisz potrzebę, np. praca z kodem wymaga dużego ekranu, stanowisko dwumonitorowe..."
                    value={monitorForm.justification}
                    onChange={(e) => setMonitorForm({...monitorForm, justification: e.target.value})}
                />
            </div>
        </div>
    )

    // ============================================================
    //  KLAWIATURA / MYSZ FORM
    // ============================================================
    const renderPeripheralsForm = () => (
        <div className="space-y-5">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-200 mt-0.5 shrink-0" />
                <p className="text-[11px] text-foreground/80 leading-relaxed">
                    Zamów peryferia komputerowe. Pola oznaczone <span className="text-pink-400">*</span> są wymagane.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">
                        Typ urządzenia <span className="text-pink-400">*</span>
                    </Label>
                    <Select value={peripheralsForm.deviceType} onValueChange={(v) => setPeripheralsForm({...peripheralsForm, deviceType: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Wybierz typ..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Klawiatura">Klawiatura</SelectItem>
                            <SelectItem value="Klawiatura mechaniczna">Klawiatura mechaniczna</SelectItem>
                            <SelectItem value="Klawiatura ergonomiczna">Klawiatura ergonomiczna</SelectItem>
                            <SelectItem value="Mysz">Mysz</SelectItem>
                            <SelectItem value="Mysz ergonomiczna / pionowa">Mysz ergonomiczna / pionowa</SelectItem>
                            <SelectItem value="Zestaw (klawiatura + mysz)">Zestaw (klawiatura + mysz)</SelectItem>
                            <SelectItem value="Podkładka pod mysz">Podkładka pod mysz</SelectItem>
                            <SelectItem value="Podkładka pod nadgarstki">Podkładka pod nadgarstki</SelectItem>
                            <SelectItem value="Hub USB">Hub USB</SelectItem>
                            <SelectItem value="Inne">Inne (opisz w uzasadnieniu)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Łączność</Label>
                    <Select value={peripheralsForm.connectivity} onValueChange={(v) => setPeripheralsForm({...peripheralsForm, connectivity: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Typ połączenia..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Bezprzewodowa (Bluetooth)">Bezprzewodowa (Bluetooth)</SelectItem>
                            <SelectItem value="Bezprzewodowa (USB dongle)">Bezprzewodowa (USB dongle)</SelectItem>
                            <SelectItem value="Przewodowa (USB)">Przewodowa (USB)</SelectItem>
                            <SelectItem value="Bez preferencji">Bez preferencji</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Układ klawiatury</Label>
                    <Select value={peripheralsForm.layout} onValueChange={(v) => setPeripheralsForm({...peripheralsForm, layout: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue placeholder="Layout..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Polski (QWERTY PL)">Polski (QWERTY PL)</SelectItem>
                            <SelectItem value="US International">US International</SelectItem>
                            <SelectItem value="UK">UK</SelectItem>
                            <SelectItem value="Nie dotyczy">Nie dotyczy (mysz / inne)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Preferowana marka / model</Label>
                    <Input
                        className="bg-black/30 border-white/10 text-sm h-9"
                        placeholder="np. Logitech MX Keys, Apple Magic..."
                        value={peripheralsForm.preferredBrand}
                        onChange={(e) => setPeripheralsForm({...peripheralsForm, preferredBrand: e.target.value})}
                    />
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Ilość sztuk</Label>
                    <Select value={peripheralsForm.quantity} onValueChange={(v) => setPeripheralsForm({...peripheralsForm, quantity: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="4">4</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Priorytet</Label>
                    <Select value={peripheralsForm.priority} onValueChange={(v) => setPeripheralsForm({...peripheralsForm, priority: v})}>
                        <SelectTrigger className="bg-black/30 border-white/10 text-sm h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="niski">Niski</SelectItem>
                            <SelectItem value="normalny">Normalny</SelectItem>
                            <SelectItem value="wysoki">Wysoki</SelectItem>
                            <SelectItem value="pilny">Pilny</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Potrzebne do (data)</Label>
                    <Input
                        type="date"
                        className="bg-black/30 border-white/10 text-sm h-9"
                        value={peripheralsForm.neededBy}
                        onChange={(e) => setPeripheralsForm({...peripheralsForm, neededBy: e.target.value})}
                    />
                </div>

                <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Dodatkowe elementy</Label>
                    <Input
                        className="bg-black/30 border-white/10 text-sm h-9"
                        placeholder="np. mata biurkowa, organizer kabli..."
                        value={peripheralsForm.additionalItems}
                        onChange={(e) => setPeripheralsForm({...peripheralsForm, additionalItems: e.target.value})}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-xs text-gray-300">
                    Uzasadnienie / Cel <span className="text-pink-400">*</span>
                </Label>
                <Textarea
                    className="bg-black/30 border-white/10 text-sm min-h-[80px] resize-none"
                    placeholder="Opisz powód zamówienia, np. wymiana zużytego sprzętu, potrzeby ergonomiczne, nowe stanowisko..."
                    value={peripheralsForm.justification}
                    onChange={(e) => setPeripheralsForm({...peripheralsForm, justification: e.target.value})}
                />
            </div>
        </div>
    )

    // ============================================================
    //  SUCCESS VIEW
    // ============================================================
    const renderSuccess = () => (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-lg font-bold text-white">Zamówienie złożone!</h3>
            <p className="text-sm text-gray-400 text-center max-w-sm">
                Twoje zgłoszenie zostało przekazane do działu IT. Otrzymasz powiadomienie o zmianie statusu.
            </p>
        </div>
    )

    const formTitles: Record<string, { title: string; desc: string; icon: React.FC<any> }> = {
        laptop: { title: 'Laptop / Akcesoria', desc: 'Zamów laptop lub akcesoria komputerowe', icon: Laptop },
        monitor: { title: 'Ekran / Monitor', desc: 'Zamów monitor lub akcesoria do wyświetlania', icon: Monitor },
        peripherals: { title: 'Klawiatura / Mysz', desc: 'Zamów peryferia komputerowe', icon: Keyboard }
    }

    return (
        <div className="space-y-6">
            {/* Category Buttons */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[
                    { icon: Laptop, label: "Laptop / Akcesoria", form: 'laptop' as FormCategory },
                    { icon: Monitor, label: "Ekran / Monitor", form: 'monitor' as FormCategory },
                    { icon: Keyboard, label: "Klawiatura / Mysz", form: 'peripherals' as FormCategory }
                ].map((item, i) => (
                    <Button
                        key={i}
                        variant="outline"
                        className="h-24 flex flex-col gap-2 border-white/10 hover:bg-white/5 hover:border-primary/50 group"
                        onClick={() => setActiveForm(item.form)}
                    >
                        <item.icon className="w-6 h-6 text-gray-500 group-hover:text-primary transition-colors" />
                        <span className="text-xs font-semibold">{item.label}</span>
                    </Button>
                ))}
            </div>

            {/* Orders List */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="bg-white/5 border-white/10 md:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                            <Truck className="w-4 h-4 text-orange-400" />
                            Twoje Zgłoszenia
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {initialData.length > 0 ? (
                            <div className="space-y-3">
                                {initialData.map((req: any) => {
                                    const status = statusMap[req.status] || statusMap['w_toku']
                                    const StatusIcon = status.icon
                                    return (
                                        <div key={req.id} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5 group hover:border-white/10 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="p-2 bg-white/5 rounded-lg">
                                                    <Package className="w-4 h-4 text-gray-400" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-200">{req.item_name}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] text-muted-foreground">{req.id.slice(0, 8)}</span>
                                                        <span className="text-[10px] text-muted-foreground">&bull;</span>
                                                        <span className="text-[10px] text-muted-foreground">{new Date(req.created_at).toLocaleDateString('pl-PL')}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Badge variant="outline" className={`border-0 ${status.color} px-2 h-6 text-[10px] flex items-center gap-1.5`}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {status.label}
                                                </Badge>
                                                <ChevronRight className="w-4 h-4 text-gray-700" />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="py-8 text-center space-y-2">
                                <p className="text-sm text-muted-foreground italic">Brak aktywnych zgłoszeń</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-slate-200" />
                            Wsparcie IT
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 space-y-2">
                            <p className="text-[10px] text-foreground font-medium">Masz problem techniczny?</p>
                            <p className="text-[10px] text-gray-400 leading-relaxed">Pomożemy Ci z konfiguracją sprzętu, dostępami do systemów B2B.net lub problemami z siecią.</p>
                        </div>
                        <div className="space-y-2">
                            <Button variant="outline" className="w-full justify-start gap-3 h-10 border-white/10 hover:bg-white/5" asChild>
                                <a href="mailto:recepcja@b2bnetwork.pl">
                                    <Mail className="w-4 h-4 text-slate-200" />
                                    <span className="text-xs">recepcja@b2bnetwork.pl</span>
                                </a>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ORDER FORM DIALOG */}
            <FormDialog open={!!activeForm} onOpenChange={(open) => { if (!open) { setActiveForm(null); setSubmitSuccess(false) } }}>
                <FormDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-950 border-white/10 text-white">
                    <FormDialogHeader className="border-b border-white/10 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                {activeForm && (() => {
                                    const Icon = formTitles[activeForm]?.icon
                                    return Icon ? <Icon className="w-5 h-5 text-primary" /> : null
                                })()}
                            </div>
                            <div>
                                <FormDialogTitle className="text-lg font-bold">
                                    {activeForm && formTitles[activeForm]?.title}
                                </FormDialogTitle>
                                <FormDialogDescription className="text-xs text-gray-400">
                                    {activeForm && formTitles[activeForm]?.desc}
                                </FormDialogDescription>
                            </div>
                        </div>
                    </FormDialogHeader>

                    {submitSuccess ? renderSuccess() : (
                        <>
                            <div className="py-2">
                                {activeForm === 'laptop' && renderLaptopForm()}
                                {activeForm === 'monitor' && renderMonitorForm()}
                                {activeForm === 'peripherals' && renderPeripheralsForm()}
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                                <Button
                                    variant="outline"
                                    className="border-white/10 hover:bg-white/5"
                                    onClick={() => setActiveForm(null)}
                                    disabled={isSubmitting}
                                >
                                    <X className="w-4 h-4 mr-2" />
                                    Anuluj
                                </Button>
                                <Button
                                    className="gap-2"
                                    onClick={handleSubmit}
                                    disabled={isSubmitting || !isFormValid()}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Wysyłam...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-4 h-4" />
                                            Złóż zamówienie
                                        </>
                                    )}
                                </Button>
                            </div>
                        </>
                    )}
                </FormDialogContent>
            </FormDialog>
        </div>
    )
}
