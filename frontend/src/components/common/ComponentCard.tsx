interface ComponentCardProps {
  title: string;
  children: React.ReactNode;
  className?: string; // Additional custom classes for styling
  desc?: string; // Description text
}

const ComponentCard: React.FC<ComponentCardProps> = ({
  title,
  children,
  className = "",
  desc = "",
}) => {
  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}
    >
      {/* Card Header */}
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <h3 className="break-words text-sm font-medium text-gray-800 dark:text-white/90 sm:text-base">
          {title}
        </h3>
        {desc && (
          <p className="mt-1 break-words text-xs leading-5 text-gray-500 dark:text-gray-400 sm:text-sm">
            {desc}
          </p>
        )}
      </div>

      {/* Card Body */}
      <div className="border-t border-gray-100 p-3 dark:border-gray-800 sm:p-6">
        <div className="space-y-4 sm:space-y-6">{children}</div>
      </div>
    </div>
  );
};

export default ComponentCard;
