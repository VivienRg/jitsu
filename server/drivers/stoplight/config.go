//defines the StoplightConfig struct, which contains the configuration options for the Stoplight driver.
package stoplight

import (
	"errors"
	"github.com/jitsucom/jitsu/server/drivers/base"
)

type StoplightConfig struct {
	AccessToken  string                 `mapstructure:"access_token" json:"access_token,omitempty" yaml:"access_token,omitempty"`
	ApiVersion   string                 `mapstructure:"api_version" json:"api_version,omitempty" yaml:"api_version,omitempty"`
	Calendars    *base.CollectionConfig `mapstructure:"calendars" json:"calendars,omitempty" yaml:"calendars,omitempty"`
	Contacts     *base.CollectionConfig `mapstructure:"contacts" json:"contacts,omitempty" yaml:"contacts,omitempty"`
	Opportunities *base.CollectionConfig `mapstructure:"opportunities" json:"opportunities,omitempty" yaml:"opportunities,omitempty"`
}

//Validate() method validates the StoplightConfig struct and returns an error if any of the fields are invalid
func (stc *StoplightConfig) Validate() error {
	if stc == nil {
		return errors.New("Stoplight config is required")
	}

	if stc.AccessToken == "" {
		return errors.New("Stoplight access_token is required")
	}

	if stc.ApiVersion == "" {
		return errors.New("Stoplight api_version is required")
	}

	if stc.Calendars == nil {
		return errors.New("Stoplight calendars collection is required")
	}

	if stc.Contacts == nil {
		return errors.New("Stoplight contacts collection is required")
	}

	if stc.Opportunities == nil {
		return errors.New("Stoplight opportunities collection is required")
	}

	err := stc.Calendars.Validate()
	if err != nil {
		return err
	}

	err = stc.Contacts.Validate()
	if err != nil {
		return err
	}

	err = stc.Opportunities.Validate()
	if err != nil {
		return err
	}

	return nil
}
