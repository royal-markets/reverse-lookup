import * as React from "react";
import URLInput from "../../Input"

import { cn } from "@/lib/utils";
import { SearchIcon } from "lucide-react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  hasIcon?: boolean;
  spotifyUrl?: string;
  handleChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  submitForm?: (e: React.FormEvent<HTMLFormElement>) => void;
}

// add spotifyUrl, handleChange, submitForm as inputs to input
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, spotifyUrl, handleChange, submitForm, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };

const CultInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasIcon, children, spotifyUrl, handleChange, submitForm, ...props }, ref) => {
    return (
      <div className='flex flex-col items-center justify-center'>
        {/* <div
          className={cn(
            "relative w-full before:pointer-events-none  before:absolute before:-inset-1 before:rounded-[9991px] before:border before:border-base-100/20 before:opacity-0 before:ring-2 before:ring-base-100/40 before:transition dark:before:border-base-400/20 dark:before:ring-2 dark:before:ring-base-900/40",
            "input-shadow-glow after:pointer-events-none after:absolute after:inset-px after:rounded-[9987px] after:shadow-white/5 after:transition",
            "focus-base:before:opacity-100 focus-within:after:shadow-base-100/20 dark:after:base-white/5 dark:focus-within:after:shadow-base-500/30"
          )}
        > */}
          <URLInput className={className} spotifyUrl={spotifyUrl} handleChange={handleChange} submitForm={submitForm} />
          {/* <Input
          
            type="search"
            autoComplete="false"
            className={cn(
              "w-full  text-lg font-semibold",
              "focus:outline-none focus:ring-2 focus:ring-base focus:ring-base-100 dark:focus:ring-base-900/50 group",
              "disabled:cursor-not-allowed disabled:opacity-50 sm:leading-6 ",
              "dark:border dark:border-black/40 ",
              "input-shadow rounded-[9988px] !outline-none",
              "relative border border-black/5 bg-base-900/90 py-4 pl-12 pr-7  shadow-black/5 placeholder:text-base-400 focus:bg-base-900 ",
              // " dark:bg-base-950/50 dark:text-base-200 dark:shadow-black/10 dark:placeholder:text-base-500",
              " text-base-50 dark:bg-base-800/70 dark:text-base-100 dark:shadow-black/10 dark:placeholder:text-base-500",
              "dark:focus:bg-base-800",
              className
            )}
            ref={ref}
            {...props}
          /> */}
          {/* {hasIcon ? (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-5">
              <SearchIcon className="stroke-base-500/70 " />
            </div>
          ) : null} */}
        {/* </div> */}
        {children}
      </div>
    );
  }
);

CultInput.displayName = "CultInput";

export { CultInput };
