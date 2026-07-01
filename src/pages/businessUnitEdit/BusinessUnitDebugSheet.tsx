import React from 'react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '../../components/ui/sheet';
import { Code, Copy, Check } from 'lucide-react';

interface BusinessUnitDebugSheetProps {
  rawResponse: unknown;
  rawClusterUsersResponse: unknown;
  id: string | undefined;
  clusterId: string;
  debugTab: 'bu' | 'users';
  setDebugTab: React.Dispatch<React.SetStateAction<'bu' | 'users'>>;
  copied: boolean;
  onCopy: (data: unknown) => void;
}

const BusinessUnitDebugSheet: React.FC<BusinessUnitDebugSheetProps> = ({ rawResponse, rawClusterUsersResponse, id, clusterId, debugTab, setDebugTab, copied, onCopy }) => (
  <Sheet>
    <SheetTrigger asChild>
      <Button
        size="icon"
        className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30"
      >
        <Code className="h-5 w-5" />
      </Button>
    </SheetTrigger>
    <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl overflow-y-auto p-4 sm:p-6">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Code className="h-4 w-4 sm:h-5 sm:w-5" />
          API Responses
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">DEV</Badge>
        </SheetTitle>
        <SheetDescription className="text-xs sm:text-sm">Raw JSON responses from all endpoints</SheetDescription>
      </SheetHeader>
      <div className="mt-3 sm:mt-4">
        <div className="flex border-b mb-3 sm:mb-4 overflow-x-auto">
          <button
            onClick={() => setDebugTab('bu')}
            className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${debugTab === 'bu' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Business Unit
          </button>
          <button
            onClick={() => setDebugTab('users')}
            className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${debugTab === 'users' ? 'border-amber-500 text-amber-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Cluster Users
          </button>
        </div>

        {debugTab === 'bu' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-muted-foreground truncate">{`GET /api-system/business-units/${id}`}</span>
              <Button variant="outline" size="sm" className="self-end sm:self-auto" onClick={() => onCopy(rawResponse)}>
                {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <pre className="text-[10px] sm:text-xs bg-gray-900 text-gray-100 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
              {rawResponse ? JSON.stringify(rawResponse, null, 2) : 'No data'}
            </pre>
          </div>
        )}
        {debugTab === 'users' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-muted-foreground truncate">{`GET /api-system/user/clusters/${clusterId}`}</span>
              <Button variant="outline" size="sm" className="self-end sm:self-auto" onClick={() => onCopy(rawClusterUsersResponse)}>
                {copied ? <Check className="mr-1.5 h-3 w-3" /> : <Copy className="mr-1.5 h-3 w-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <pre className="text-[10px] sm:text-xs bg-gray-900 text-gray-100 p-3 sm:p-4 rounded-lg overflow-auto max-h-[60vh] sm:max-h-[calc(100vh-10rem)]">
              {rawClusterUsersResponse ? JSON.stringify(rawClusterUsersResponse, null, 2) : 'No data'}
            </pre>
          </div>
        )}
      </div>
    </SheetContent>
  </Sheet>
);

export default BusinessUnitDebugSheet;
