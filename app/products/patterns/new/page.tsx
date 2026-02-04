import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PatternForm } from '@/components/PatternForm'

export default function NewPatternPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Link
        href="/products/patterns"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Patterns
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">New Pattern</h1>
        <p className="text-gray-500 mt-1">
          Create a new pattern to group related SKUs
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <PatternForm />
      </div>
    </div>
  )
}
