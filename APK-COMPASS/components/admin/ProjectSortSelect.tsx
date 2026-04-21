'use client'

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useRouter, useSearchParams } from "next/navigation"

export function ProjectSortSelect() {
    const searchParams = useSearchParams()
    const { replace } = useRouter()

    // Default sort: newest
    const currentSort = searchParams.get('sort') || 'newest'

    const handleSortChange = (value: string) => {
        const params = new URLSearchParams(searchParams)
        if (value) {
            params.set('sort', value)
        } else {
            params.delete('sort')
        }
        replace(`?${params.toString()}`)
    }

    return (
        <Select defaultValue={currentSort} onValueChange={handleSortChange}>
            <SelectTrigger className="w-[180px] bg-secondary/20 border-white/10 text-white">
                <SelectValue placeholder="Sortuj według" />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a2e] border-white/10 text-white">
                <SelectItem value="newest">Najnowsze</SelectItem>
                <SelectItem value="oldest">Najstarsze</SelectItem>
                <SelectItem value="title_asc">Tytuł (A-Z)</SelectItem>
                <SelectItem value="title_desc">Tytuł (Z-A)</SelectItem>
            </SelectContent>
        </Select>
    )
}
