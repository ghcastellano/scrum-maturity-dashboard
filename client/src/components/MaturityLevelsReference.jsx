export default function MaturityLevelsReference() {
  return (
    <div className="card mb-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        📖 Maturity Levels Reference
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Level 1 */}
        <div className="border-2 border-red-300 rounded-lg p-4 bg-red-50">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center font-bold">
              1
            </div>
            <div>
              <div className="font-bold text-red-900">Assisted Scrum</div>
              <div className="text-xs text-red-700">Scrum Manager Required</div>
            </div>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="bg-white bg-opacity-50 rounded p-2">
              <div className="font-semibold text-red-900">Rollover Rate:</div>
              <div className="text-red-800">&gt; 20-25%</div>
            </div>
            <div className="bg-white bg-opacity-50 rounded p-2">
              <div className="font-semibold text-red-900">Sprint Goals Met:</div>
              <div className="text-red-800">&lt; 50-60%</div>
            </div>
            <div className="bg-white bg-opacity-50 rounded p-2">
              <div className="font-semibold text-red-900">Backlog Health:</div>
              <div className="text-red-800">Poor hygiene</div>
            </div>
            <div className="bg-white bg-opacity-50 rounded p-2">
              <div className="font-semibold text-red-900">Mid-Sprint Injection:</div>
              <div className="text-red-800">High (&gt;25%)</div>
            </div>
          </div>
          
          <div className="mt-4 pt-3 border-t border-red-300">
            <div className="text-xs font-semibold text-red-900 mb-1">Focus:</div>
            <div className="text-xs text-red-800">
              Establish basic operating cadence, improve planning
            </div>
          </div>
        </div>

        {/* Level 2 */}
        <div className="border-2 border-yellow-300 rounded-lg p-4 bg-yellow-50">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-yellow-600 text-white flex items-center justify-center font-bold">
              2
            </div>
            <div>
              <div className="font-bold text-yellow-900">Supported Scrum</div>
              <div className="text-xs text-yellow-700">Conditional Support</div>
            </div>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="bg-white bg-opacity-50 rounded p-2">
              <div className="font-semibold text-yellow-900">Rollover Rate:</div>
              <div className="text-yellow-800">~10-20%</div>
            </div>
            <div className="bg-white bg-opacity-50 rounded p-2">
              <div className="font-semibold text-yellow-900">Sprint Goals Met:</div>
              <div className="text-yellow-800">~60-70%</div>
            </div>
            <div className="bg-white bg-opacity-50 rounded p-2">
              <div className="font-semibold text-yellow-900">Backlog Health:</div>
              <div className="text-yellow-800">Mostly healthy</div>
            </div>
            <div className="bg-white bg-opacity-50 rounded p-2">
              <div className="font-semibold text-yellow-900">Scope Churn:</div>
              <div className="text-yellow-800">Manageable</div>
            </div>
          </div>
          
          <div className="mt-4 pt-3 border-t border-yellow-300">
            <div className="text-xs font-semibold text-yellow-900 mb-1">Support Model:</div>
            <div className="text-xs text-yellow-800">
              Shared Scrum Manager, 1-2 sprints/month
            </div>
          </div>
        </div>

        {/* Level 3 */}
        <div className="border-2 border-green-300 rounded-lg p-4 bg-green-50">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">
              3
            </div>
            <div>
              <div className="font-bold text-green-900">Self-Managed Scrum</div>
              <div className="text-xs text-green-700">Scrum Manager Optional</div>
            </div>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="bg-white bg-opacity-50 rounded p-2">
              <div className="font-semibold text-green-900">Rollover Rate:</div>
              <div className="text-green-800">&lt; 10-15%</div>
            </div>
            <div className="bg-white bg-opacity-50 rounded p-2">
              <div className="font-semibold text-green-900">Sprint Goals Met:</div>
              <div className="text-green-800">&gt; 70%</div>
            </div>
            <div className="bg-white bg-opacity-50 rounded p-2">
              <div className="font-semibold text-green-900">Backlog Ready:</div>
              <div className="text-green-800">&gt; 80-90%</div>
            </div>
            <div className="bg-white bg-opacity-50 rounded p-2">
              <div className="font-semibold text-green-900">Mid-Sprint Churn:</div>
              <div className="text-green-800">Minimal (&lt;10%)</div>
            </div>
          </div>
          
          <div className="mt-4 pt-3 border-t border-green-300">
            <div className="text-xs font-semibold text-green-900 mb-1">Support:</div>
            <div className="text-xs text-green-800">
              On-demand coaching, quarterly health checks
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>Note:</strong> Level 3 entry criteria must be sustained for 3-4 sprints. 
          Rollover thresholds may vary based on internal ticket closure processes.
        </p>
      </div>
    </div>
  );
}
