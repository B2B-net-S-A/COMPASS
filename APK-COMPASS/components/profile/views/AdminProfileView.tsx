'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Shield, Server, Users, FileText, Database, Activity, LayoutDashboard } from "lucide-react"
import Link from 'next/link'
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CentralaProfileView } from '@/components/profile/views/CentralaProfileView'
import { ConsultantProfileView } from '@/components/profile/views/ConsultantProfileView'

export function AdminProfileView({ userProfile }: { userProfile: any }) {
    return (
        <div className="min-h-screen p-6 space-y-8 max-w-7xl mx-auto">
            <ProfileHeader profile={userProfile} />

            <Tabs defaultValue="admin" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="admin" className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Panel Administratora
                    </TabsTrigger>
                    <TabsTrigger value="centrala" className="flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4" />
                        Widok Centrali
                    </TabsTrigger>
                    <TabsTrigger value="consultant" className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Widok Konsultanta
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="admin" className="space-y-4">
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl font-bold tracking-tight">Panel Administratora</h1>
                        <p className="text-muted-foreground">
                            Konfiguracja systemu, zarządzanie użytkownikami i monitoring.
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Użytkownicy</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">1,234</div>
                                <p className="text-xs text-muted-foreground">
                                    +45 w tym tygodniu
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">System Health</CardTitle>
                                <Activity className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-500">99.9%</div>
                                <p className="text-xs text-muted-foreground">
                                    Wszystkie systemy sprawne
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Baza Danych</CardTitle>
                                <Database className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">45 GB</div>
                                <p className="text-xs text-muted-foreground">
                                    12.5% zajętości
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Logi Błędów</CardTitle>
                                <FileText className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">0</div>
                                <p className="text-xs text-muted-foreground">
                                    Ostatnie 24h
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        <Card className="col-span-2">
                            <CardHeader>
                                <CardTitle>Szybkie Akcje</CardTitle>
                                <CardDescription>Najczęściej używane narzędzia administracyjne</CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <Link href="/admin/users">
                                    <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                                        <Users className="h-6 w-6" />
                                        <span>Zarządzaj Użytkownikami</span>
                                    </Button>
                                </Link>
                                <Link href="/admin/roles">
                                    <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                                        <Shield className="h-6 w-6" />
                                        <span>Role i Uprawnienia</span>
                                    </Button>
                                </Link>
                                <Link href="/admin/logs">
                                    <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                                        <FileText className="h-6 w-6" />
                                        <span>Logi Systemowe</span>
                                    </Button>
                                </Link>
                                <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                                    <Server className="h-6 w-6" />
                                    <span>Restart Usług</span>
                                </Button>
                                <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                                    <Database className="h-6 w-6" />
                                    <span>Backup Danych</span>
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Globalne Ustawienia</CardTitle>
                                <CardDescription>Skróty konfiguracji</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between p-2 border rounded">
                                    <span className="text-sm font-medium">Rejestracja otwarta</span>
                                    <div className="h-3 w-3 rounded-full bg-green-500" />
                                </div>
                                <div className="flex items-center justify-between p-2 border rounded">
                                    <span className="text-sm font-medium">Tryb konserwacji</span>
                                    <div className="h-3 w-3 rounded-full bg-gray-300" />
                                </div>
                                <div className="flex items-center justify-between p-2 border rounded">
                                    <span className="text-sm font-medium">Email Notifications</span>
                                    <div className="h-3 w-3 rounded-full bg-green-500" />
                                </div>
                                <Button className="w-full mt-4">Przejdź do Ustawień</Button>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="centrala">
                    <div className="pt-4">
                        <CentralaProfileView userProfile={userProfile} hideHeader={true} />
                    </div>
                </TabsContent>

                <TabsContent value="consultant">
                    <div className="pt-4">
                        <ConsultantProfileView />
                    </div>
                </TabsContent>

            </Tabs>
        </div>
    )
}
