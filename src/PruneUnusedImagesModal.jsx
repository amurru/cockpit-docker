import React, { useState } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button";
import { Checkbox } from "@patternfly/react-core/dist/esm/components/Checkbox";
import { Flex } from "@patternfly/react-core/dist/esm/layouts/Flex";
import { List, ListItem } from "@patternfly/react-core/dist/esm/components/List";
import { Modal } from "@patternfly/react-core/dist/esm/components/Modal";
import cockpit from 'cockpit';

import * as client from './client.js';
import * as utils from './util.js';

import "@patternfly/patternfly/utilities/Spacing/spacing.css";

const _ = cockpit.gettext;

function ImageOptions({ images, checked, handleChange, name, showCheckbox }) {
    const [isExpanded, onToggle] = useState(false);
    let shownImages = images;
    if (!isExpanded) {
        shownImages = shownImages.slice(0, 5);
    }

    if (shownImages.length === 0) {
        return null;
    }
    const listNameId = "list-" + name;

    return (
        <Flex flex={{ default: 'column' }}>
            {showCheckbox &&
                <Checkbox
                  label={_("Delete unused images:")}
                  isChecked={checked}
                  id={name}
                  name={name}
                  onChange={(_, val) => handleChange(val)}
                  aria-owns={listNameId}
                />
            }
            <List id={listNameId}>
                {shownImages.map((image, index) =>
                    <ListItem className="pf-v5-u-ml-md" key={index}>
                        {utils.image_name(image)}
                    </ListItem>
                )}
                {!isExpanded && images.length > 5 &&
                <Button onClick={onToggle} variant="link" isInline>
                    {_("Show more")}
                </Button>
                }
            </List>
        </Flex>
    );
}

const PruneUnusedImagesModal = ({ close, unusedImages, onAddNotification }) => {
    const [isPruning, setPruning] = useState(false);
    const [deleteImages, setDeleteImages] = React.useState(true);

    const handlePruneUnusedImages = () => {
        setPruning(true);

        client.pruneUnusedImages().then(close)
                .catch(ex => {
                    const error = _("Failed to prune unused images");
                    onAddNotification({ type: 'danger', error, errorDetail: ex.message });
                    close();
                });
    };

    const showCheckboxes = unusedImages.length > 0;

    return (
        <Modal isOpen
               onClose={close}
               position="top" variant="medium"
               title={cockpit.format(_("Prune unused images"))}
               footer={<>
                   <Button id="btn-img-delete" variant="danger"
                           spinnerAriaValueText={isPruning ? _("Pruning images") : undefined}
                           isLoading={isPruning}
                           onClick={handlePruneUnusedImages}>
                       {isPruning ? _("Pruning images") : _("Prune")}
                   </Button>
                   <Button variant="link" onClick={() => close()}>{_("Cancel")}</Button>
               </>}
        >
            <Flex flex={{ default: 'column' }}>
                <ImageOptions
              images={unusedImages}
              name="deleteImages"
              checked={deleteImages}
              handleChange={setDeleteImages}
              showCheckbox={showCheckboxes}
                />
            </Flex>
        </Modal>
    );
};

export default PruneUnusedImagesModal;
