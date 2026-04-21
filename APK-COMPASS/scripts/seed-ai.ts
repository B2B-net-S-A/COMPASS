import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables BEFORE importing anything that uses them
dotenv.config({ path: '.env.local' })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.OPENAI_API_KEY) {
    console.error('Missing environment variables')
    process.exit(1)
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const projects = [
    {
        title: 'Senior Java Developer',
        description: 'Poszukujemy doświadczonego programisty Java do rozwoju systemu bankowego. Wymagana znajomość Spring Boot, Hibernate oraz architektury mikroserwisów. Projekt długoterminowy, praca nad core bankingiem.',
        skills: ['Java', 'Spring Boot', 'Microservices', 'SQL'],
        budget: '120 - 160 PLN/h'
    },
    {
        title: 'Frontend React Developer',
        description: 'Tworzenie nowoczesnych interfejsów użytkownika dla platformy e-commerce. Wymagane doświadczenie w React, TypeScript i Tailwind CSS. Praca w zwinny zespole Scrumowym.',
        skills: ['React', 'TypeScript', 'Tailwind', 'Next.js'],
        budget: '100 - 140 PLN/h'
    },
    {
        title: 'DevOps Engineer (AWS)',
        description: 'Utrzymanie i rozwój infrastruktury w chmurze AWS. Terraform, Kubernetes, CI/CD (GitLab). Automatyzacja procesów deploymentu.',
        skills: ['AWS', 'Terraform', 'Kubernetes', 'Docker'],
        budget: '130 - 170 PLN/h'
    },
    {
        title: 'Python Data Scientist',
        description: 'Analiza dużych zbiorów danych, budowa modeli ML. Wymagana znajomość Python, Pandas, Scikit-learn. Projekt dla branży medycznej.',
        skills: ['Python', 'Machine Learning', 'Data Science'],
        budget: '110 - 150 PLN/h'
    },
    {
        title: 'Fullstack .NET Developer',
        description: 'Rozwój aplikacji webowych w technologii .NET Core i Angular. Praca dla klienta z branży ubezpieczeniowej. Wymagana dobra znajomość C#.',
        skills: ['.NET', 'C#', 'Angular', 'SQL Server'],
        budget: '110 - 150 PLN/h'
    }
]

async function seed() {
    // Dynamic import to ensure dotenv loads first AND we get the lazily initialized client if possible
    // Note: Since lib/ai/embeddings.ts initializes OpenAI at top level, we rely on the fact that
    // this dynamic import happens AFTER dotenv.config() above.
    const { generateEmbedding } = await import('../lib/ai/embeddings')

    console.log('🌱 Seeding projects with AI embeddings...')

    for (const project of projects) {
        const text = `${project.title} ${project.description} ${project.skills.join(' ')}`
        const embedding = await generateEmbedding(text)

        // We delete existing projects with same title to avoid duplicates during re-seed
        await supabase.from('projects').delete().eq('title', project.title)

        const { error } = await supabase.from('projects').insert({
            title: project.title,
            description: project.description,
            required_skills: project.skills,
            budget_range: project.budget,
            embedding
        })

        if (error) console.error(`Error inserting ${project.title}:`, error)
        else console.log(`✅ Inserted: ${project.title}`)
    }

    console.log('done!')
}

seed()
