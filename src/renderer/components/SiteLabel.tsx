import React from 'react';

interface Props {
  name: string;
}

export const SiteLabel: React.FC<Props> = ({ name }) => (
  <div className="bg-black/60 text-white text-xs px-2 py-0.5 rounded max-w-[calc(100%-8px)] truncate">
    {name}
  </div>
);
